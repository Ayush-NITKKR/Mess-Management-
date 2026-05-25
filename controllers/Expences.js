const supabase = require('../connections/supabase')
const moment = require("moment");

const TZ_OFFSET_MINUTES = Number(process.env.TZ_OFFSET_MINUTES || 330) // default IST
const getDayRange = (date = moment()) => {
  const start = moment(date).utcOffset(TZ_OFFSET_MINUTES).startOf('day')
  const end = moment(date).utcOffset(TZ_OFFSET_MINUTES).endOf('day')
  return { start, end, dateString: start.format('YYYY-MM-DD') }
}

/**
 * dailyUpdate — runs once per day via cron (00:00)
 *
 * ResidentAccount updates:
 *  - consumedAmount  → running sum of all DailyExpense.totalAmount for the resident
 *  - totalMessFee    → taken from the active FeeConfig (kept in sync every run)
 */
exports.dailyUpdate = async () => {
  try {
  const { start: todayStart, end: todayEnd, dateString } = getDayRange()

    // ── 1. Active FeeConfig ──────────────────────────────────────────────────
    const { data: feeConfigs, error: fErr } = await supabase
      .from('FeeConfig')
      .select('id, dailyMealRate, totalMessFee')
      .eq('isActive', true)
      .order('createdAt', { ascending: false })
      .limit(1)

    if (fErr) throw new Error(`FeeConfig fetch failed: ${fErr.message}`)
    const feeConfig = feeConfigs?.[0]
    if (!feeConfig) throw new Error('No active FeeConfig found')

    const dailyMealRate = Number(feeConfig.dailyMealRate) || 0
    const totalMessFee  = Number(feeConfig.totalMessFee)  || 0  // ← from FeeConfig

    // ── 2. All resident profiles ─────────────────────────────────────────────
    const { data: profiles, error: pErr } = await supabase
      .from('ResidentProfile')
      .select('rollNumber, userId')
    if (pErr) throw new Error(`ResidentProfile fetch failed: ${pErr.message}`)
    if (!profiles?.length) return { success: true, processed: 0, message: 'No residents' }

    const allRolls = profiles.map(p => p.rollNumber)

    // ── 3. Approved rebates only ─────────────────────────────────────────────
    const { data: allRebates, error: rErr } = await supabase
      .from('Rebate')
      .select('rollNumber, startDate, endDate')
      .eq('isApproved', true)

    if (rErr) console.warn('Rebate fetch failed (continuing):', rErr.message)

    const rebateMap = {}
    for (const r of allRebates || []) {
      const key = r.rollNumber || 'global'
      rebateMap[key] = rebateMap[key] || []
      rebateMap[key].push({
        start: moment(r.startDate).utcOffset(TZ_OFFSET_MINUTES).startOf('day'),
        end:   moment(r.endDate).utcOffset(TZ_OFFSET_MINUTES).endOf('day'),
      })
    }

    const isRebateDay = (rollNumber) => {
      const check = (ranges) =>
  ranges?.some(r => todayStart.isBetween(r.start, r.end, null, '[]')) ?? false
      return check(rebateMap[rollNumber]) || check(rebateMap['global'])
    }

    // ── 4. Today's existing DailyExpense rows ────────────────────────────────
    const { data: existingDE, error: deErr } = await supabase
      .from('DailyExpense')
      .select('id, rollNumber, date')
      .in('rollNumber', allRolls)
      .eq('date', dateString)

    if (deErr) throw new Error(`DailyExpense fetch failed: ${deErr.message}`)

    const deByRoll = Object.fromEntries((existingDE || []).map(de => [de.rollNumber, de]))

    // ── 5. Bulk-insert missing DailyExpense rows ─────────────────────────────
    const missingRolls = allRolls.filter(roll => !deByRoll[roll])

    if (missingRolls.length) {
      const inserts = missingRolls.map(roll => ({
        rollNumber:  roll,
  date:        dateString,
        mealCharge:  0,
        extraAmount: 0,
        totalAmount: 0,
        isRebate:    false,
        createdAt:   new Date().toISOString(),
      }))

      const { data: inserted, error: insErr } = await supabase
        .from('DailyExpense')
        .insert(inserts)
        .select('id, rollNumber')

      if (insErr) throw new Error(`Bulk DailyExpense insert failed: ${insErr.message}`)
      for (const de of inserted || []) deByRoll[de.rollNumber] = de
    }

    // ── 6. ExtraItems for today's expense IDs ────────────────────────────────
    const allDeIds = Object.values(deByRoll).map(de => de.id)

    const { data: extraItems, error: eErr } = await supabase
      .from('DailyExtraItem')
      .select('dailyExpenseId, totalAmount')
      .in('dailyExpenseId', allDeIds)

    if (eErr) console.warn('DailyExtraItem fetch failed (continuing):', eErr.message)

    const extraByDeId = {}
    for (const item of extraItems || []) {
      extraByDeId[item.dailyExpenseId] =
        (extraByDeId[item.dailyExpenseId] || 0) + Number(item.totalAmount || 0)
    }

    // ── 7. Compute DailyExpense updates ──────────────────────────────────────
    const updates = profiles.map(({ rollNumber }) => {
      const de          = deByRoll[rollNumber]
      const rebate      = isRebateDay(rollNumber)
      const mealCharge  = rebate ? 0 : dailyMealRate
      const extraAmount = extraByDeId[de?.id] || 0
      const totalAmount = mealCharge + extraAmount

      return { id: de.id, mealCharge, extraAmount, totalAmount, isRebate: rebate }
    })

    // ── 8. Batch-update DailyExpense in parallel ──────────────────────────────
    const updateResults = await Promise.all(
      updates.map(({ id, ...fields }) =>
        supabase.from('DailyExpense').update(fields).eq('id', id)
      )
    )

    const failedDE = updateResults.filter(r => r.error)
    if (failedDE.length) console.warn(`${failedDE.length} DailyExpense update(s) failed`)

    // ── 9. Sync ResidentAccount ───────────────────────────────────────────────
    // Fetch ALL DailyExpense totals for all residents (entire semester, not just today)
    const { data: allExpenses, error: aeErr } = await supabase
      .from('DailyExpense')
      .select('rollNumber, totalAmount')
      .in('rollNumber', allRolls)

    if (aeErr) {
      console.warn('Failed to fetch expenses for account sync:', aeErr.message)
    } else {
      // Sum consumed per resident
      const consumedByRoll = {}
      for (const exp of allExpenses) {
        consumedByRoll[exp.rollNumber] =
          (consumedByRoll[exp.rollNumber] || 0) + Number(exp.totalAmount || 0)
      }

      // Parallel update: consumedAmount + totalMessFee (from FeeConfig) + feeConfigId
      await Promise.all(
        allRolls.map(roll =>
          supabase
            .from('ResidentAccount')
            .update({
              consumedAmount: consumedByRoll[roll] || 0,   // today's daily total added
              totalMessFee,                                  // synced from active FeeConfig
              feeConfigId:    feeConfig.id,                 // keep FK in sync
            })
            .eq('rollNumber', roll)
        )
      )
    }

    // ── 10. Result ────────────────────────────────────────────────────────────
    const processed = updates.length - failedDE.length
    console.log(`dailyUpdate complete — ${processed}/${updates.length} residents updated`)
    return { success: true, processed, failed: failedDE.length }

  } catch (error) {
    console.error('dailyUpdate error:', error.message || error)
    return { success: false, message: error.message || 'Unknown error' }
  }
}
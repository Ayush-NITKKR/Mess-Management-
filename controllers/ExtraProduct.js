const supabase = require('../connections/supabase')
const moment = require('moment')

const TZ_OFFSET_MINUTES = Number(process.env.TZ_OFFSET_MINUTES || 330) // default IST
const getDayRange = (date = moment()) => {
  const start = moment(date).utcOffset(TZ_OFFSET_MINUTES).startOf('day')
  const end = moment(date).utcOffset(TZ_OFFSET_MINUTES).endOf('day')
  return { start, end, dateString: start.format('YYYY-MM-DD') }
}

// Create an extra product 
exports.createExtraProduct = async (req, res) => {
	try {
		const { name, price, isActive } = req.body
		if (!name || price == null) return res.status(400).json({ success: false, message: 'name and price are required' })

		const payload = { name, price: Number(price), isActive: isActive === undefined ? true : !!isActive, createdAt: new Date().toISOString() }
		const { data, error } = await supabase.from('ExtraProduct').insert(payload).select()
		if (error) return res.status(500).json({ success: false, message: error.message })
		return res.status(201).json({ success: true, data: data[0] })
	} catch (error) {
		return res.status(500).json({ success: false, message: 'Internal Server Error' })
	}
}

// Update an extra product by id
exports.updateExtraProduct = async (req, res) => {
	try {
		const { id } = req.params
		if (!id) return res.status(400).json({ success: false, message: 'id param required' })

		const { name, price, isActive } = req.body
		const payload = {}
		if (name !== undefined) payload.name = name
		if (price !== undefined) payload.price = Number(price)
		if (isActive !== undefined) payload.isActive = !!isActive

		if (Object.keys(payload).length === 0) return res.status(400).json({ success: false, message: 'Nothing to update' })

		const { data, error } = await supabase.from('ExtraProduct').update(payload).eq('id', id).select()
		if (error) return res.status(500).json({ success: false, message: error.message })
		if (!data || data.length === 0) return res.status(404).json({ success: false, message: 'ExtraProduct not found' })
		return res.json({ success: true, data: data[0] })
	} catch (error) {
		return res.status(500).json({ success: false, message: 'Internal Server Error' })
	}
}
exports.getAllActiveExtraProduct = async (req,res) => {
	try {
		const {data , error} = await supabase.from('ExtraProduct')
											 .select('*')
											 .eq('isActive',true);
		if(error){
			return res.status(500).json({
				success:false,
				message:"Unable to fetch the product"
			});
		}
		return res.status(200).json({
			success:true,
			message:"All the active product is fetched",
			data:data,
		});

	} catch (error) {
		return res.status(500).json({
			success:false,
			message:`Can not fetch due to error:${error.message}`
		})
	}
}
// add extra product to the user
exports.addExtraProduct = async (req, res) => {
  try {
    const { rollNumber, productId, quantity } = req.body

    // ── Validation ────────────────────────────────────────────────────────────
    if (!rollNumber) return res.status(400).json({ success: false, message: 'rollNumber is required' })
    if (!productId)  return res.status(400).json({ success: false, message: 'productId is required' })

    const qty = Number(quantity ?? 1)
    if (!Number.isFinite(qty) || qty <= 0)
      return res.status(400).json({ success: false, message: 'quantity must be a positive number' })

    // ── 1. Validate resident + product in parallel ────────────────────────────
    const [{ data: profileRows, error: profileError }, { data: productRows, error: productError }] =
      await Promise.all([
        supabase.from('ResidentProfile').select('rollNumber').eq('rollNumber', rollNumber).limit(1),
        supabase.from('ExtraProduct').select('id, price, isActive, name').eq('id', productId).limit(1),
      ])

    if (profileError) return res.status(500).json({ success: false, message: profileError.message })
    if (!profileRows?.length) return res.status(404).json({ success: false, message: 'Resident not found' })

    if (productError) return res.status(500).json({ success: false, message: productError.message })
    const product = productRows?.[0]
    if (!product)              return res.status(404).json({ success: false, message: 'ExtraProduct not found' })
    if (!product.isActive)     return res.status(400).json({ success: false, message: 'ExtraProduct is inactive' })

    const unitPrice   = Number(product.price)
    const totalAmount = unitPrice * qty

    // ── 2. Find or create today's DailyExpense ───────────────────────────────
  const { start: todayStart, end: todayEnd, dateString } = getDayRange()

    let dailyExpense = null
    const { data: existingDE, error: deErr } = await supabase
      .from('DailyExpense')
      .select('id, extraAmount, totalAmount')
      .eq('rollNumber', rollNumber)
  .eq('date', dateString)
      .limit(1)

    if (deErr) return res.status(500).json({ success: false, message: deErr.message })
    if (existingDE && existingDE.length > 0) {
      dailyExpense = existingDE[0]
    } else {
      const { data: createdDE, error: createErr } = await supabase
        .from('DailyExpense')
        .insert({
          rollNumber,
          date:        dateString,
          mealCharge:  0,
          extraAmount: 0,
          totalAmount: 0,
          isRebate:    false,
          createdAt:   new Date().toISOString(),
        })
        .select('id, extraAmount, totalAmount')

      if (createErr) return res.status(500).json({ success: false, message: createErr.message })
      dailyExpense = createdDE && createdDE[0]
    }

    // ── 3. Insert DailyExtraItem ──────────────────────────────────────────────
    const { data: item, error: itemErr } = await supabase
      .from('DailyExtraItem')
      .insert({
        productId,
        quantity:       qty,
        unitPrice,
        totalAmount,
        dailyExpenseId: dailyExpense.id,          // ← correct column name from schema
        createdAt:      new Date().toISOString(),
      })
      .select()
      .single()

    if (itemErr) return res.status(500).json({ success: false, message: itemErr.message })

    // ── 4. Update DailyExpense totals ───────────────────────────────────────
    const updatedExtraAmount = Number(dailyExpense.extraAmount || 0) + totalAmount
    const updatedTotalAmount = Number(dailyExpense.totalAmount || 0) + totalAmount
    await supabase
      .from('DailyExpense')
      .update({ extraAmount: updatedExtraAmount, totalAmount: updatedTotalAmount })
      .eq('id', dailyExpense.id)

    return res.status(201).json({
      success:        true,
      message:        'Extra product added successfully',
      dailyExpenseId: dailyExpense.id,
      item,
    })

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Internal Server Error' })
  }
}

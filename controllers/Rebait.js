const supabase = require('../connections/supabase')
const moment = require('moment')

// create a rebate entry
exports.createRebait = async (req, res) => {
	try {
		// user identification: prefer authenticated user from req.user, else accept userId or rollNumber in body
		const authUser = req.user;
		const { startDate, endDate, reason } = req.body

		if (!startDate || !endDate) return res.status(400).json({ success: false, message: 'startDate and endDate are required' })

		// compute no_of_days inclusive
		const s = moment(startDate).startOf('day')
		const e = moment(endDate).startOf('day')
		if (!s.isValid() || !e.isValid()) return res.status(400).json({ success: false, message: 'Invalid dates' })
		if (e.isBefore(s)) return res.status(400).json({ success: false, message: 'endDate must be same or after startDate' })

		const no_days = e.diff(s, 'days') + 1

				const payload = {
		rollNumber: authUser.rollNumber,
		startDate: s.format('YYYY-MM-DD'),
		endDate: e.format('YYYY-MM-DD'),
		totalDays: no_days,
		reason: reason || null,
		isApproved: false,
		createdAt: new Date().toISOString()
		}

		const { data, error } = await supabase.from('Rebate').insert(payload).select()
		if (error) return res.status(500).json({ success: false, message: error.message })
		return res.status(201).json({ success: true, data: data[0] })
	} catch (error) {
		console.error('createRebait error', error)
		return res.status(500).json({ success: false, message: 'Internal Server Error' })
	}
}

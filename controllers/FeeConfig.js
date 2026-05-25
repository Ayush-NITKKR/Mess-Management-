const supabase = require('../connections/supabase')

// Create a new fee config
exports.createFeeConfig = async (req, res) => {
	try {
		const { semesterName, totalMessFee, dailyMealRate, startDate, endDate, isActive } = req.body
		if (!semesterName || !totalMessFee || !dailyMealRate || !startDate || !endDate) {
			return res.status(400).json({ success: false, message: 'semesterName, totalMessFee, dailyMealRate, startDate, endDate are required' })
		}

		const { data, error } = await supabase
			.from('FeeConfig')
			.insert([{ semesterName, totalMessFee, dailyMealRate, startDate: new Date(startDate), endDate: new Date(endDate), isActive: isActive ?? true }])
			.select()

		if (error) return res.status(500).json({ success: false, message: error.message })

		return res.status(201).json({ success: true, data: data[0] })
	} catch (err) {
		return res.status(500).json({ success: false, message: 'Internal Server Error' })
	}
}

// List fee configs
exports.getFeeConfigs = async (req, res) => {
	try {
		const { data, error } = await supabase.from('FeeConfig').select('*').order('createdAt', { ascending: false })
		if (error) return res.status(500).json({ success: false, message: error.message })
		return res.json({ success: true, data })
	} catch (err) {
		return res.status(500).json({ success: false, message: 'Internal Server Error' })
	}
}

// Get single fee config
exports.getFeeConfigById = async (req, res) => {
	try {
		const { id } = req.params
		const { data, error } = await supabase.from('FeeConfig').select('*').eq('id', id).limit(1)
		if (error) return res.status(500).json({ success: false, message: error.message })
		if (!data || data.length === 0) return res.status(404).json({ success: false, message: 'Not found' })
		return res.json({ success: true, data: data[0] })
	} catch (err) {
		return res.status(500).json({ success: false, message: 'Internal Server Error' })
	}
}

// Update fee config
exports.updateFeeConfig = async (req, res) => {
	try {
		const { id } = req.params
		const updates = req.body
		if (updates.startDate) updates.startDate = new Date(updates.startDate)
		if (updates.endDate) updates.endDate = new Date(updates.endDate)

		const { data, error } = await supabase.from('FeeConfig').update(updates).eq('id', id).select()
		if (error) return res.status(500).json({ success: false, message: error.message })
		return res.json({ success: true, data: data[0] })
	} catch (err) {
		return res.status(500).json({ success: false, message: 'Internal Server Error' })
	}
}

// Deactivate fee config
exports.deactivateFeeConfig = async (req, res) => {
	try {
		const { id } = req.params
		const { data, error } = await supabase.from('FeeConfig').update({ isActive: false }).eq('id', id).select()
		if (error) return res.status(500).json({ success: false, message: error.message })
		return res.json({ success: true, data: data[0] })
	} catch (err) {
		return res.status(500).json({ success: false, message: 'Internal Server Error' })
	}
}


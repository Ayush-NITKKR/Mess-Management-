const supabase = require('../connections/supabase')

//Get the user details

exports.getUserDetails = async (req, res) => {
    try {
        // allow lookup by query string or body
        const { email, rollNumber } = { ...req.query, ...req.body }

        if (!email && !rollNumber) {
            return res.status(400).json({ success: false, message: 'email or rollNumber is required' })
        }

        let user = null
        let profile = null

        if (email) {
            const { data: users, error } = await supabase
                .from('user')
                .select('*')
                .eq('email', email.toLowerCase())
                .limit(1)

            if (error) return res.status(500).json({ success: false, message: error.message })
            if (!users || users.length === 0) return res.status(404).json({ success: false, message: 'User not found' })

            user = users[0]

            const { data: profiles, error: pErr } = await supabase
                .from('ResidentProfile')
                .select('*')
                .eq('userId', user.id)
                .limit(1)

            if (pErr) return res.status(500).json({ success: false, message: pErr.message })
            profile = profiles && profiles[0]
        } else {
            // lookup by rollNumber
            const { data: profiles, error } = await supabase
                .from('ResidentProfile')
                .select('*')
                .eq('rollNumber', rollNumber)
                .limit(1)

            if (error) return res.status(500).json({ success: false, message: error.message })
            if (!profiles || profiles.length === 0) return res.status(404).json({ success: false, message: 'Profile not found' })

            profile = profiles[0]

            const { data: users, error: uErr } = await supabase
                .from('user')
                .select('*')
                .eq('id', profile.userId)
                .limit(1)

            if (uErr) return res.status(500).json({ success: false, message: uErr.message })
            user = users && users[0]
            if (!user) return res.status(404).json({ success: false, message: 'User not found' })
        }

        // strip sensitive fields
        if (user.password) delete user.password

        // If user is a resident, ResidentProfile must exist and we return full resident details
        const result = {
            id: user.id,
            email: user.email,
            role: user.role,
            isVerified: user.isVerified,
            createdAt: user.createdAt
        }

        if (user.role === 'RESIDENT') {
            if (!profile) {
                return res.status(404).json({ success: false, message: 'Resident profile not found' })
            }
            // include full resident profile fields
            result.residentDetails = {
                rollNumber: profile.rollNumber,
                userId: profile.userId,
                name: profile.name,
                course: profile.course,
                phoneNumber: profile.phoneNumber,
                aadharNumber: profile.aadharNumber,
                roomNumber: profile.roomNumber,
                imageUrl: profile.imageUrl,
                joinDate: profile.joinDate
            }
            // also include profile under legacy key for compatibility
            result.profile = profile
        } else {
            result.profile = profile || null
        }

        return res.json({ success: true, data: result })
    } catch (error) {
        return res.status(500).json({
            success:false,
            message:"Internal Server Error"
        })
    }
}

// Get all unverified users with optional resident profile
exports.getUnverifiedUsers = async (req, res) => {
    try {
        // only residents
        const { data: users, error } = await supabase
            .from('user')
            .select('*')
            .eq('isVerified', false)
            .eq('role', 'RESIDENT')

        if (error) return res.status(500).json({ success: false, message: error.message })
        if (!users || users.length === 0) return res.json({ success: true, data: [] })

        const userIds = users.map(u => u.id)

        // fetch resident profiles for these users
        const { data: profiles, error: pErr } = await supabase
            .from('ResidentProfile')
            .select('*')
            .in('userId', userIds)

        if (pErr) return res.status(500).json({ success: false, message: pErr.message })

        const profileByUserId = {}
        if (profiles && profiles.length) {
            profiles.forEach(p => { profileByUserId[p.userId] = p })
        }

        const result = users.map(u => {
            const userCopy = { id: u.id, email: u.email, role: u.role, isVerified: u.isVerified, createdAt: u.createdAt }
            if (profileByUserId[u.id]) userCopy.profile = profileByUserId[u.id]
            return userCopy
        })

        return res.json({ success: true, data: result })
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Internal Server Error' })
    }
}

// Verify a user by ID (set isVerified = true) and create ResidentAccount
exports.verifyUser = async (req, res) => {
    try {
        const { id } = req.params
        if (!id) return res.status(400).json({ success: false, message: 'User id is required in params' })

        // Fetch user to validate role
        const { data: userFetch, error: fetchErr } = await supabase
            .from('user')
            .select('*')
            .eq('id', id)
            .single()

        if (fetchErr || !userFetch) return res.status(404).json({ success: false, message: 'User not found' })
        if (userFetch.role !== 'RESIDENT') return res.status(400).json({ success: false, message: 'Only RESIDENT users can be verified this way' })

        // Update isVerified
        const { data: updatedUser, error } = await supabase
            .from('user')
            .update({ isVerified: true })
            .eq('id', id)
            .select()
            .single()

        if (error) return res.status(500).json({ success: false, message: error.message })
        const user = updatedUser
        if (user.password) delete user.password

        // attach profile if exists
        const { data: profile, error: pErr } = await supabase
            .from('ResidentProfile')
            .select('*')
            .eq('userId', user.id)
            .single()

        let residentProfile = null
        if (!pErr && profile) residentProfile = profile

        // Create ResidentAccount if profile exists and no account exists yet
        let residentAccount = null
        if (residentProfile) {
            // find active FeeConfig (most recent active)
            const { data: feeConfigs, error: feeErr } = await supabase
                .from('FeeConfig')
                .select('*')
                .eq('isActive', true)
                .order('createdAt', { ascending: false })
                .limit(1)

            let feeConfig = null
            if (!feeErr && feeConfigs && feeConfigs.length > 0) feeConfig = feeConfigs[0]

            // check if ResidentAccount already exists for this rollNumber
            const { data: existingAccounts, error: accErr } = await supabase
                .from('ResidentAccount')
                .select('*')
                .eq('rollNumber', residentProfile.rollNumber)
                .limit(1)

            if (!accErr && existingAccounts && existingAccounts.length > 0) {
                residentAccount = existingAccounts[0]
            } else {
                // insert new ResidentAccount
                const insertPayload = {
                    rollNumber: residentProfile.rollNumber,
                    consumedAmount: 0,
                    feeConfigId: feeConfig ? feeConfig.id : null,
                    totalMessFee: feeConfig ? feeConfig.totalMessFee : null
                }

                const { data: inserted, error: insertErr } = await supabase
                    .from('ResidentAccount')
                    .insert(insertPayload)
                    .select()

                if (!insertErr && inserted && inserted.length > 0) residentAccount = inserted[0]
            }
        }

        return res.json({ success: true, data: { user, profile: residentProfile, residentAccount } })
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Internal Server Error' })
    }
}

// Update resident profile by rollNumber (room change, phone update)
exports.updateResidentProfile = async (req, res) => {
    try {
        const { rollNumber } = req.params
        if (!rollNumber) return res.status(400).json({ success: false, message: 'rollNumber param is required' })

        const { roomNumber, phoneNumber } = req.body
        if (!roomNumber && !phoneNumber) return res.status(400).json({ success: false, message: 'At least one of roomNumber or phoneNumber is required' })

        // find profile
        const { data: profiles, error: pErr } = await supabase
            .from('ResidentProfile')
            .select('*')
            .eq('rollNumber', rollNumber)
            .limit(1)

        if (pErr) return res.status(500).json({ success: false, message: pErr.message })
        if (!profiles || profiles.length === 0) return res.status(404).json({ success: false, message: 'Resident profile not found' })

        const profile = profiles[0]

        // authorization: allow ADMIN or the owner (req.user.email or id)
        if (!req.user) return res.status(401).json({ success: false, message: 'Authentication required' })
        const isOwner = req.user.id === profile.userId
        if (!(req.user.role === 'ADMIN' || isOwner)) return res.status(403).json({ success: false, message: 'Forbidden' })

        const updatePayload = {}
        if (roomNumber) updatePayload.roomNumber = roomNumber
        if (phoneNumber) updatePayload.phoneNumber = phoneNumber

        const { data: updatedProfiles, error: uErr } = await supabase
            .from('ResidentProfile')
            .update(updatePayload)
            .eq('rollNumber', rollNumber)
            .select()

        if (uErr) return res.status(500).json({ success: false, message: uErr.message })
        if (!updatedProfiles || updatedProfiles.length === 0) return res.status(404).json({ success: false, message: 'Update failed' })

        return res.json({ success: true, data: updatedProfiles[0] })
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Internal Server Error' })
    }
}
// verify the phone number by OTP
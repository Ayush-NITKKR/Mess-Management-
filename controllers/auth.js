const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const nodemailer = require('nodemailer')
const supabase = require('../connections/supabase');
const createMailer = require('../utility/mailSender');
require("dotenv").config();

const sendOtp = async (req,res) => {
  try {
    const { email } = req.body;
    if (!process.env.MAIL_HOST || !process.env.MAIL_USER || !process.env.MAIL_PASS) {
        return res.status(500).json({
          message: 'Email service not configured. Please contact admin.'
        })
      }
      const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString()
      const normalizedEmail = email.toLowerCase()

        const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

        const { data: createdOtp, error: createError } = await supabase
            .from('Otp')
            .insert({
                email: normalizedEmail,
                otp: generatedOtp,
                otpExpiry: otpExpiry,
                createdAt: new Date()
            })
            .select();
       if(createError){
        return res.status(400).json({
            success:false,
            message:"Otp is not registered"
        })
       }
       try {
          await createMailer(
              normalizedEmail,
              'Your Mess Management OTP',
              `Your OTP for registration is ${generatedOtp}. It expires in 10 minutes.`,
              `
                <p>Your OTP for registration is <strong>${generatedOtp}</strong>.</p>
                <p>This OTP expires in <strong>10 minutes</strong>.</p>
              `
          );

          console.log("Mail sent successfully");
      } catch(err) {
          console.error("Mail error:", err);

          return res.status(500).json({
              success: false,
              message: "Failed to send OTP email"
          });
      }
      return res.status(200).json({
        message: 'OTP sent to your email. Verify and retry registration.',
        success: true
      })
    
  } catch (error) {
    return res.status(500).json({
        message: 'something went wrong',
        success: false,
        error:error.message
      })
  }
}

const registerUser = async (req, res) => {
  try {
    const {
      rollNumber,
      password,
      firstName,
      lastName,
      role,
      email,
      confirmPassword,
      otp
    } = req.body
    // Validate the data
    if ( !password || !firstName || !lastName || !email || !confirmPassword) {
      return res.status(400).json({
        message: 'rollNumber, password, firstName, lastName, email, and confirmPassword are required'
      })
    }
    // validate the email // oFFicail na rhe
   const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(email)) {
        return res.status(400).json({ message: 'Invalid email or domain not allowed.' })
      }
    // prevent the student whose domain is @nitkkr.ac.in
    if(email.toLowerCase().endsWith('@nitkkr.ac.in') && role === "RESIDENT"){
      return res.status(400).json({ message: 'Offical email not allowed.' })
    }
    // Validate the password 
    if (password !== confirmPassword) {
      return res.status(400).json({ message: 'password is not matching' })
    }
    // OTP verification

        const { data: otpRows, error: otpError } = await supabase
        .from('Otp')
        .select('*')
        .eq('email', email.toLowerCase())
        .eq('otp', otp)
        .order('createdAt', { ascending: false })
        .limit(1);

        if (otpError) {
        return res.status(500).json({
            message: 'Server error',
            error: otpError.message
        });
        }

        const otpRecord = otpRows && otpRows[0];

        if (!otpRecord) {
        return res.status(400).json({
            message: 'Invalid OTP'
        });
        }

        // Check expiry
      // Check expiry
            const currentTime = new Date();
            const expiryTime = new Date(otpRecord.otpExpiry);

            if (isNaN(expiryTime.getTime())) {
                return res.status(500).json({
                    success: false,
                    message: "Invalid OTP expiry format"
                });
            }

            if (currentTime > expiryTime) {

                // Delete expired OTP
                await supabase
                    .from('Otp')
                    .delete()
                    .eq('id', otpRecord.id);

                return res.status(400).json({
                    success: false,
                    message: 'OTP expired. Please request a new one.'
                });
            }
    // Check the enail
    const { data: userByEmail, error: emailCheckError } = await supabase
      .from('user')
      .select('*')
      .eq('email', email.toLowerCase())
      .limit(1)

    if (emailCheckError) {
      return res.status(500).json({ message: 'Server error', error: emailCheckError.message })
    }
    if (userByEmail && userByEmail.length > 0) {
      return res.status(400).json({ message: 'User already exists' })
    }
    //ROll number checking
    const { data: userByRoll, error: rollCheckError } = await supabase
      .from('ResidentProfile')
      .select('*')
      .eq('rollNumber', rollNumber)
      .limit(1)

    if (rollCheckError) {
      return res.status(500).json({ message: 'Server error', error: rollCheckError.message })
    }
    if (userByRoll && userByRoll.length > 0) {
      return res.status(400).json({ message: 'User already exists' })
    }
    // Password hashing
    const passwordHash = await bcrypt.hash(password, 10)

    const { data: createdUsers, error: createError } = await supabase
      .from('user')
      .insert([
        {
          email: email.toLowerCase(),
          password: passwordHash,
          role: role,
          isVerified: false
        }
      ])
      .select()

    if (createError) {
      return res.status(500).json({ message: 'Server error', error: createError.message })
    }


    const user = createdUsers && createdUsers[0]

    const profilePicture = `https://api.dicebear.com/7.x/initials/svg?seed=${firstName}`

    // create a ResidentProfile linked to this user
    const fullName = `${firstName} ${lastName}`.trim()
    const { data: createdProfiles, error: profileError } = await supabase
      .from('ResidentProfile')
      .insert([
        {
          rollNumber,
          userId: user.id,
          name: fullName,
          course: null,
          phoneNumber: null,
          aadharNumber: null,
          roomNumber: null,
          imageUrl: profilePicture,
          joinDate: new Date()
        }
      ])
      .select()

    if (profileError) {
      // attempt to clean up created user if profile creation fails
      await supabase.from('user').delete().eq('id', user.id)
      return res.status(500).json({ 
        message: 'Server error', 
        error: profileError.message })
    }

    
    res.status(201).json({
      success:true,
      message: 'User created successfully',
      user: {
        id: user.id,
        rollNumber,
        firstName,
        lastName,
        email: user.email,
        role: user.role,
        profilePicture
      }
    })
    // delete the used OTP after successful registration
    try {
      await supabase.from('Otp').delete().eq('email', email.toLowerCase()).eq('otp', otp)
    } catch (e) {
      // non-fatal: log and continue
      console.warn('Failed to delete OTP after registration', e && e.message)
    }
  } catch (error) {
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message })
  }
}

//Login
const loginUser = async (req,res) =>{
    try{
        const { email, password } = req.body

        if (!email || !password) {
          return res.status(400).json({ message: 'email and password are required' })
        }

        // find the user by email
    const { data: users, error: userError } = await supabase
      .from('user')
      .select('*')
      .eq('email', email.toLowerCase())
      .limit(1)

    if (userError) {
      return res.status(500).json({ message: 'Server error', error: userError.message })
    }

    const user = users && users[0]
    if(!user){
            return res.status(404).json({message : 'User not found'})
        }
    // Only verified one can login 
    if(!user.isVerified){
        return res.status(404).json({message : 'User Application is Not Approved'});
    }

      // check the password (user.password according to your schema)
      const dbPasswordHash = user.password || user.password_hash || user.passwordHash
      const isMatch = await bcrypt.compare(password, dbPasswordHash)
        if(!isMatch){
            return res.status(401).json({message :"wrong password"})
        }
      

      // generate the token 
      const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    )

    // Set httpOnly cookie with the JWT before sending the response
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 1 day // 6 mahine ki login
    }
    res.cookie('token', token, cookieOptions)
    res.status(200).json({
      message: 'Login successful',
      user: {
        id: user.id,
        token:token,
        email: user.email,
        fullName: user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim(),
        role: user.role
      }
    })
    }catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message })
  }
}

const logoutUser = (req, res) => {
  res.clearCookie('token')
  res.json({ message: 'Logged out' })
}
module.exports = {
  registerUser,
  loginUser,
  logoutUser,
  sendOtp
}



//TODO: Problem in OTP expiry (resolve it)

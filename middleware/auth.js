const jwt = require('jsonwebtoken')
const supabase = require('../connections/supabase')

// verifyToken reads token from cookie named 'token'
const verifyToken = async (req, res, next) => {
  try {
    // Accept token from cookie, Authorization header (Bearer), or body
    const tokenFromCookie = req.cookies && req.cookies.token
    const authHeader = req.headers && (req.headers.authorization || req.headers.Authorization)
    const tokenFromHeader = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null
    const tokenFromBody = req.body && req.body.token

    const token = tokenFromCookie || tokenFromHeader || tokenFromBody
    if (!token) return res.status(401).json({ message: 'Authentication required' })

    let decoded
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET)
    } catch (verr) {
      if (process.env.NODE_ENV === 'development') {
        return res.status(401).json({ message: 'Invalid token', error: verr.message })
      }
      return res.status(401).json({ message: 'Invalid token' })
    }
    if (!decoded) return res.status(401).json({ message: 'Invalid token' })

    // Optionally fetch fresh user from DB
    const { data: users, error } = await supabase
      .from('user')
      .select('*')
      .eq('id', decoded.id)
      .limit(1)

    if (error ) {
      return res.status(401).json({ message: error.message })
    }
    let rollNumber = null;
    if(users[0].role === "RESIDENT"){
          const {data, error} = await supabase
          .from('ResidentProfile')
          .select('*')
          .eq('userId',decoded.id)
          rollNumber = data[0].rollNumber;
      if (error ) {
      return res.status(401).json({ message: 'roll number not found' })
    }

    }

    req.user = users[0]
    
    req.user.rollNumber = rollNumber;
    next()
  } catch (err) {
    console.log(err.message);
    return res.status(401).json({ message: 'Invalid or expired token' })
  }
}

// requireRole returns middleware that checks if req.user.role is in allowed roles
// Accepts either requireRole('ADMIN','RESIDENT') or requireRole(['ADMIN'])
const requireRole = (...roles) => {
  // if first arg is an array, use it
  if (roles.length === 1 && Array.isArray(roles[0])) roles = roles[0]
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' })
    if (!roles.includes(req.user.role)) return res.status(403).json({ message: 'Forbidden' })
    next()
  }
}

module.exports = { verifyToken, requireRole }

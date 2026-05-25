require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,// project url
    process.env.SUPABASE_KEY// secret key
);

module.exports = supabase;
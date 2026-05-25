require('dotenv').config();

const express = require('express');
const supabase = require('./connections/supabase');
const router = require('./routes/auth');
const Extrarouter = require('./routes/extraProduct');
const Feerouter = require('./routes/fees');
const rebaitRouter = require('./routes/rebaits');
const residentProfileRouter = require('./routes/residentProfile');
const expencesRouter = require('./routes/expences');
const app = express();
const cookieParser = require('cookie-parser');
const cron = require('node-cron')
const fileUpload = require("express-fileupload");
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const path = require('path');
const cors = require('cors');
//Middleware 
app.use(
    fileUpload({
        useTempFiles:true,
        tempFileDir:"/tmp",
    })
)
app.use(cors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true,
    credentials: true
}));
app.use(cookieParser());
app.use(express.json());


//clodinary connection
const {cloudinaryConnect} = require("./connections/cloudinary");
cloudinaryConnect();


//Routes
app.use('/api/v1/auth',router);
app.use('/api/v1/extra',Extrarouter);
app.use('/api/v1/resident', residentProfileRouter);
app.use('/api/v1/expences', expencesRouter);
app.use(Feerouter);
app.use(rebaitRouter);

// Swagger UI
const swaggerDocument = YAML.load(path.join(__dirname, 'swagger.yaml'));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// schedule dailyUpdate at 00:00 (server local time)
try {
    const expencesController = require('./controllers/Expences')
    // Cron expression: '0 0 * * *' -> At 00:00 every day
    cron.schedule('0 0 * * *', async () => {
        console.log('Running scheduled dailyUpdate...')
        const result = await expencesController.dailyUpdate()
        console.log('dailyUpdate result:', result)
    })
} catch (e) {
    console.warn('Could not schedule dailyUpdate cron job:', e.message)
}

// manual trigger (optional) - useful for testing; protect or remove in production
const { verifyToken, requireRole } = require('./middleware/auth')
const expencesController = require('./controllers/Expences')
app.post('/_run/daily-update', async (req, res) => {
    const result = await expencesController.dailyUpdate()
    return res.json(result)
})

//start the server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`Server Running on Port ${PORT}`);
});
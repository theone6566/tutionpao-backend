import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());

app.get('/', (req, res) => {
    res.status(200).send("TutionPao Real API is Running! 🚀🚀");
});

app.get('/api/auth/login', (req, res) => {
    res.json({ isNewUser: true, message: "Minimal Test OK" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`✅ Barebones server on ${PORT}`);
});

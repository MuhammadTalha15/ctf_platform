const { app, seedData } = require("./app");

const PORT = process.env.PORT || 3000;

seedData()
    .then(() => {
        app.listen(PORT, "0.0.0.0", () => {
            console.log(`🚀 CTF Platform running`);
            console.log(`🌐 Local:   http://localhost:${PORT}`);
            console.log(`🌍 Network: http://<YOUR_KALI_IP>:${PORT}`);
            console.log(`👤 Admin login: admin / admin123`);
            console.log(`👤 User login: hacker1 / user123`);
        });
    })
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
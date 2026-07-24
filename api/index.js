const { app, seedData } = require("../app");

let initialized = false;

module.exports = async (req, res) => {
    try {
        if (!initialized) {
            await seedData();
            initialized = true;
        }

        return app(req, res);
    } catch (err) {
        console.error(err);
        res.status(500).send("Internal Server Error");
    }
};
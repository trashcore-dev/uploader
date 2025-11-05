const express = require("express");
const path = require("path");
const fs = require("fs-extra");
const axios = require("axios");
const ytsr = require("ytsr");

const app = express();
const PORT = process.env.PORT || 3000;

// Serve frontend
app.use(express.static("public"));

// Ensure temp folder exists
const tempDir = path.join(__dirname, "temp");
fs.ensureDirSync(tempDir);

// Endpoint to search and download MP3
app.get("/play", async (req, res) => {
    try {
        const query = req.query.query;
        if (!query) return res.json({ error: "🎵 Provide a song name!" });
        if (query.length > 100) return res.json({ error: "📝 Song name too long! Max 100 chars." });

        // Search YouTube
        const searchResults = await ytsr(`${query} official`, { limit: 5 });
        const video = searchResults.items.find(item => item.type === "video");
        if (!video) return res.json({ error: "😕 Couldn't find that song. Try another one!" });

        // Call API to get MP3 (your existing API)
        const apiUrl = `https://api.privatezia.biz.id/api/downloader/ytmp3?url=${encodeURIComponent(video.url)}`;
        const apiResp = await axios.get(apiUrl);
        const apiData = apiResp.data;

        if (!apiData.status || !apiData.result?.downloadUrl) throw new Error("API failed to fetch track!");

        const timestamp = Date.now();
        const fileName = `audio_${timestamp}.mp3`;
        const filePath = path.join(tempDir, fileName);

        // Download MP3
        const audioResp = await axios({
            method: "get",
            url: apiData.result.downloadUrl,
            responseType: "stream",
            timeout: 600000
        });

        const writer = fs.createWriteStream(filePath);
        audioResp.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on("finish", resolve);
            writer.on("error", reject);
        });

        if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) throw new Error("Download failed or empty file!");

        // Respond with download link
        res.json({
            title: apiData.result.title || video.title,
            downloadUrl: `/temp/${fileName}`
        });

        // Optional: auto-delete after 10 minutes
        setTimeout(() => {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }, 10 * 60 * 1000);

    } catch (error) {
        console.error("Play endpoint error:", error);
        res.json({ error: error.message });
    }
});

// Serve temp files
app.use("/temp", express.static(tempDir));

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));

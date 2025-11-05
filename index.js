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

app.get("/play", async (req, res) => {
  const query = req.query.query;
  if (!query) return res.json({ error: "🎵 Provide a song name!" });
  if (query.length > 100) return res.json({ error: "📝 Song name too long! Max 100 chars." });

  try {
    // 1️⃣ Search YouTube
    const searchResults = await ytsr(`${query} official`, { limit: 5 });
    const video = searchResults.items.find(item => item.type === "video");

    if (!video) return res.json({ error: "😕 Couldn't find that song. Try another one!" });

    // 2️⃣ Call MP3 API with timeout
    const apiUrl = `https://api.privatezia.biz.id/api/downloader/ytmp3?url=${encodeURIComponent(video.url)}`;
    const apiResp = await axios.get(apiUrl, { timeout: 15000 }); // 15 seconds max
    const apiData = apiResp.data;

    if (!apiData.status || !apiData.result?.downloadUrl) 
      return res.json({ error: "💥 Failed to fetch MP3 from API" });

    // 3️⃣ Respond immediately with download URL
    const timestamp = Date.now();
    const fileName = `audio_${timestamp}.mp3`;
    const filePath = path.join(tempDir, fileName);

    // Download MP3 to temp folder asynchronously (doesn't block response)
    axios({
      method: "get",
      url: apiData.result.downloadUrl,
      responseType: "stream",
      timeout: 60000, // 1 minute
    })
      .then(audioResp => {
        const writer = fs.createWriteStream(filePath);
        audioResp.data.pipe(writer);
        writer.on("finish", () => {
          // Optional: auto-delete after 10 minutes
          setTimeout(() => fs.existsSync(filePath) && fs.unlinkSync(filePath), 10 * 60 * 1000);
        });
        writer.on("error", err => console.error("Download error:", err));
      })
      .catch(err => console.error("Stream download failed:", err));

    // Send response to frontend immediately
    res.json({
      title: apiData.result.title || video.title,
      downloadUrl: apiData.result.downloadUrl // use API URL directly for fast download
    });

  } catch (err) {
    console.error("Play endpoint error:", err);
    res.json({ error: "💥 An unexpected error occurred. Try again!" });
  }
});

// Serve temp files if needed
app.use("/temp", express.static(tempDir));

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));

import { Router } from "express";
import multer from "multer";
import { storagePut } from "../storage";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max
  },
});

router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const fileKey = `support/${Date.now()}-${req.file.originalname}`;
    const { url } = await storagePut(fileKey, req.file.buffer, req.file.mimetype);

    res.json({ url });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: "Upload failed" });
  }
});

export default router;

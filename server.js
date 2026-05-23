require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const fetch   = require('node-fetch');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

console.log('GROQ KEY LOADED:', process.env.GROQ_API_KEY ? 'YES ✅' : 'NO ❌');

app.post('/analyze', async (req, res) => {
  console.log('📩 Request received from browser!');

  const { resumeText, jobDescription } = req.body;

  if (!resumeText || !resumeText.trim()) {
    console.log('❌ No resume text received');
    return res.status(400).json({ error: 'Resume text is required.' });
  }

  console.log('📄 Resume text length:', resumeText.length);

  const prompt = `You are a professional ATS resume expert.

RESUME:
${resumeText.slice(0, 2000)}

JOB DESCRIPTION:
${jobDescription ? jobDescription.slice(0, 1500) : "Not provided"}

Respond ONLY with valid JSON, no markdown, no extra text:
{
  "atsScore": <number 0-100>,
  "matchScore": <number 0-100, how well resume matches the JD>,
  "grade": "<A+|A|A-|B+|B|B-|C+|C|D>",
  "summary": "<2-3 sentence assessment>",
  "matchedKeywords": ["<keywords found in both resume and JD>"],
  "missingKeywords": ["<keywords in JD but missing from resume>"],
  "suggestions": ["<specific suggestion to better match this JD>"],
  "quickWins": ["<quick fix to improve match score>"],
  "sectionScores": {
    "formatting": <0-100>,
    "experience": <0-100>,
    "skills": <0-100>,
    "keywords": <0-100>
  }
}`;

  try {
    console.log('🤖 Calling Groq API...');

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          {
            role: 'system',
            content: 'You are a resume expert. Always respond with valid JSON only. No markdown, no backticks, no explanation, no extra text.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 2048
      })
    });

    console.log('📡 Groq response status:', response.status);

    if (!response.ok) {
      const errText = await response.text();
      console.error('❌ Groq API Error:', errText);
      return res.status(500).json({ error: 'Groq API error: ' + errText });
    }

    const data = await response.json();

    if (data.error) {
      console.error('❌ Groq error in data:', data.error);
      return res.status(500).json({ error: data.error.message });
    }

    const raw = data.choices?.[0]?.message?.content || '';
    console.log('✅ Raw response preview:', raw.slice(0, 150));

    if (!raw) {
      return res.status(500).json({ error: 'Empty response from AI.' });
    }

    const cleaned = raw.replace(/```json/g, '').replace(/```/g, '').trim();
    
    try {
      const result = JSON.parse(cleaned);
      console.log('✅ Successfully parsed JSON!');
      res.json(result);
    } catch (parseErr) {
      console.error('❌ JSON Parse Error:', parseErr.message);
      console.error('Attempted to parse:', cleaned.slice(0, 200));
      res.status(500).json({ error: 'AI returned invalid JSON: ' + parseErr.message });
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
    res.status(500).json({ error: 'Analysis failed: ' + err.message });
  }
});

app.listen(PORT, () => {
  console.log('');
  console.log('✅ Server is running!');
  console.log('👉 Open this link in browser: http://localhost:' + PORT);
  console.log('');
});
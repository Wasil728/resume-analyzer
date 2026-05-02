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

  const { resumeText } = req.body;

  if (!resumeText || !resumeText.trim()) {
    console.log('❌ No resume text received');
    return res.status(400).json({ error: 'Resume text is required.' });
  }

  console.log('📄 Resume text length:', resumeText.length);

  const prompt = `You are a professional resume reviewer. Analyze the resume below and respond ONLY with a valid JSON object. No markdown, no backticks, no extra text whatsoever.

RESUME:
${resumeText.slice(0, 2000)}

Return exactly this JSON structure:
{
  "atsScore": <number 0-100>,
  "grade": "<A+|A|A-|B+|B|B-|C+|C|D>",
  "summary": "<2-3 sentence overall assessment>",
  "industryFit": "<detected industry or role>",
  "experienceLevel": "<Entry-Level|Mid-Level|Senior|Executive>",
 "strengths": ["<strength1>","<strength2>"],
"weaknesses": ["<weakness1>","<weakness2>"],
"missingKeywords": ["<kw1>","<kw2>","<kw3>","<kw4>"],
"suggestions": ["<suggestion1>","<suggestion2>"],
"quickWins": ["<quickwin1>","<quickwin2>"],
  "redFlags": ["<redflag or empty string>"],
  "sectionScores": {
    "formatting": <0-100>,
    "experience": <0-100>,
    "skills": <0-100>,
    "impact": <0-100>,
    "keywords": <0-100>,
    "clarity": <0-100>
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
    const result  = JSON.parse(cleaned);

    console.log('✅ Successfully parsed JSON!');
    res.json(result);

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
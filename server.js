require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const fetch   = require('node-fetch');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '4mb' }));
app.use(express.static(path.join(__dirname, 'public')));

console.log('GROQ KEY LOADED:', process.env.GROQ_API_KEY ? 'YES ✅' : 'NO ❌');

// ── ANALYZE RESUME ────────────────────────────────────────────────────────
app.post('/analyze', async (req, res) => {
  console.log('📩 Analyze request received!');

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
  "industryFit": "<detected industry or role, e.g. Software Engineering, Marketing>",
  "experienceLevel": "<Entry Level|Mid Level|Senior Level|Executive>",
  "summary": "<2-3 sentence honest assessment of the resume>",
  "strengths": ["<specific strength found in the resume>"],
  "weaknesses": ["<specific weakness or gap in the resume>"],
  "redFlags": ["<critical issue that will cause immediate ATS rejection — leave empty array if none>"],
  "matchedKeywords": ["<keywords found in both resume and JD>"],
  "missingKeywords": ["<important keywords in JD but missing from resume>"],
  "suggestions": ["<specific actionable suggestion to improve ATS score>"],
  "quickWins": ["<quick fix implementable in under 30 minutes>"],
  "sectionScores": {
    "formatting": <0-100>,
    "experience": <0-100>,
    "skills": <0-100>,
    "keywords": <0-100>
  }
}`;

  try {
    console.log('🤖 Calling Groq API (analyze)...');

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: 'You are a resume expert. Always respond with valid JSON only. No markdown, no backticks, no explanation, no extra text.' },
          { role: 'user',   content: prompt }
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

    const raw     = data.choices?.[0]?.message?.content || '';
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    console.log('✅ Raw response preview:', raw.slice(0, 150));

    if (!raw) return res.status(500).json({ error: 'Empty response from AI.' });

    try {
      const result = JSON.parse(cleaned);
      console.log('✅ Successfully parsed JSON!');
      res.json(result);
    } catch (parseErr) {
      console.error('❌ JSON Parse Error:', parseErr.message);
      res.status(500).json({ error: 'AI returned invalid JSON: ' + parseErr.message });
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
    res.status(500).json({ error: 'Analysis failed: ' + err.message });
  }
});

// ── BUILD ATS RESUME ──────────────────────────────────────────────────────
app.post('/build-ats-resume', async (req, res) => {
  console.log('📩 ATS Resume build request received!');

  const { resumeText, jobDescription, analysisResult, resumeMode, resumeConfig } = req.body;

  if (!resumeText || !resumeText.trim()) {
    return res.status(400).json({ error: 'Resume text is required.' });
  }

  // ── Config ────────────────────────────────────────────────────────
  const mode  = resumeMode          || 'optimize';
  const field = resumeConfig?.field || 'general';
  const role  = resumeConfig?.role  || 'Professional';
  const level = resumeConfig?.level || 'mid';
  const style = resumeConfig?.style || 'modern';

  const missingKeywords = (analysisResult?.missingKeywords || []).join(', ');
  const suggestions     = (analysisResult?.suggestions    || []).slice(0, 5).join('; ');
  const atsScore        = analysisResult?.atsScore || 0;

  const levelGuide = {
    entry:     'ENTRY LEVEL (0-2 yrs): Highlight education, internships, academic projects, and eagerness to grow. Use foundational skills language.',
    mid:       'MID LEVEL (3-7 yrs): Highlight specific achievements, growing ownership, technical depth, and team contributions.',
    senior:    'SENIOR LEVEL (8-15 yrs): Highlight leadership, strategic decisions, team management, mentoring, and major business impact.',
    executive: 'EXECUTIVE (15+ yrs): Highlight P&L ownership, board-level strategy, organizational transformation, and measurable ROI at company scale.',
  };

  const styleGuide = {
    professional: 'PROFESSIONAL STYLE: Measured, formal, traditional language. Precise and authoritative tone. Ideal for finance, law, government, consulting.',
    modern:       'MODERN STYLE: Bold, results-driven, dynamic language. High-impact action verbs and strong quantified metrics. Ideal for tech, startups, SaaS, creative.',
    executive:    'EXECUTIVE STYLE: Strategic, visionary, leadership-centric language. Revenue/growth framing, transformation narrative. Ideal for C-suite, VP, Director roles.',
  };

  const fieldKeywords = {
    technology:  'software development, agile methodology, CI/CD pipeline, cloud architecture, REST APIs, microservices, system design, code review, scalability, DevOps, test-driven development',
    business:    'revenue growth, P&L management, stakeholder alignment, ROI analysis, go-to-market strategy, cross-functional leadership, KPI reporting, financial forecasting, market expansion',
    engineering: 'project lifecycle management, CAD design, structural analysis, quality assurance, safety compliance, load calculations, technical specifications, BIM, project scheduling, cost estimation',
    healthcare:  'patient care coordination, clinical protocols, HIPAA compliance, EHR/EMR systems, evidence-based practice, quality improvement, interdisciplinary collaboration, patient outcomes',
    creative:    'brand identity development, visual design, UX research, user journey mapping, creative direction, campaign performance, A/B testing, content strategy, brand storytelling',
    education:   'curriculum development, student outcomes, differentiated instruction, formative assessment, accreditation, educational technology integration, student engagement, learning management systems',
    legal:       'legal research, contract drafting and negotiation, regulatory compliance, risk mitigation, due diligence, case management, litigation support, legal writing, client counsel',
    operations:  'supply chain optimization, process improvement, KPI tracking, cost reduction strategies, vendor management, logistics coordination, Lean/Six Sigma, capacity planning, inventory management',
    general:     'strategic planning, cross-functional collaboration, performance metrics, stakeholder management, process optimization, project management, team leadership, data-driven decision making',
  };

  const modeInstruction = mode === 'fresh'
    ? `FRESH BUILD MODE: Completely rebuild this resume from the ground up as the IDEAL candidate profile for a "${role}" position in the ${field} field. Preserve ALL factual data (name, contact info, actual companies, actual dates, actual education institution names) but reimagine and rewrite every single piece of content from zero. Approach this as: "I am writing the perfect ${role} resume for this person's background."`
    : `OPTIMIZE MODE: Perform a COMPLETE AND TOTAL rewrite of this resume targeting a "${role}" position in the ${field} field. Do NOT preserve any original phrasing, sentence structure, or bullet points. Every single word of content must be rewritten from scratch — the final result should read as if composed by a professional resume writer, not as a corrected version of the original.`;

  const prompt = `You are a world-class professional resume writer with 20 years of experience helping candidates land roles at Fortune 500 and top-tier companies globally. You specialize in ATS optimization across every industry.

${modeInstruction}

═══════════════════════════════════════════════════
ORIGINAL RESUME — USE FOR FACTS ONLY, REWRITE ALL CONTENT:
═══════════════════════════════════════════════════
${resumeText.slice(0, 3500)}

═══════════════════════════════════════════════════
JOB DESCRIPTION:
═══════════════════════════════════════════════════
${jobDescription ? jobDescription.slice(0, 2000) : `Not provided — build the ideal "${role}" resume optimized for general applications in the ${field} industry`}

═══════════════════════════════════════════════════
BUILD CONFIGURATION:
═══════════════════════════════════════════════════
- Target Role: ${role}
- Industry / Field: ${field}
- Experience Level: ${levelGuide[level] || levelGuide.mid}
- Writing Style: ${styleGuide[style] || styleGuide.modern}
- Industry Keywords to Weave In: ${fieldKeywords[field] || fieldKeywords.general}
- Missing ATS Keywords to Integrate: ${missingKeywords || `Use standard high-value ATS keywords for ${role} in ${field}`}
- Current ATS Score: ${atsScore}/100 — Target output: 88-96/100

═══════════════════════════════════════════════════
NON-NEGOTIABLE REQUIREMENTS — EVERY ONE MUST BE MET:
═══════════════════════════════════════════════════
1. TOTAL REWRITE: Zero original phrasing preserved. Every sentence completely new.
2. EXPERIENCE BULLETS — For EVERY role, provide EXACTLY 5 bullets minimum. Each bullet MUST:
   • Start with a powerful, role-appropriate past-tense action verb
   • Describe a specific, concrete achievement or key responsibility
   • Include a quantified result: percentage, dollar amount, count, time saved, team size, or scale
   • If exact numbers are unavailable, use credible professional estimates (e.g., "~30%", "across 5 teams")
3. PROFESSIONAL SUMMARY: Exactly 3 sentences.
   • Sentence 1: Role title + years of experience + core expertise areas
   • Sentence 2: Standout achievement or key differentiator
   • Sentence 3: Value proposition and what you bring to a new employer
4. SKILLS: Return at minimum — 10 technical skills, 6 tools/software, 5 soft skills — ALL specific to "${role}" in ${field}
5. KEYWORDS: Integrate every single missing keyword naturally: [${missingKeywords}]
6. DATA INTEGRITY: Never invent company names, job titles, institutions, dates, or degrees. Rewrite content only.
7. ATS FORMAT: Single-column layout only. Standard section headers. No tables, columns, or special characters.
8. LEVEL TONE: Strictly follow the ${level} experience level guidance and ${style} writing style.

Respond ONLY with valid, complete JSON. No markdown fences, no backticks, no preamble, no explanation:
{
  "name": "<full name from original resume>",
  "contact": {
    "email": "<exact email from original>",
    "phone": "<exact phone from original>",
    "location": "<city, country from original>",
    "linkedin": "<linkedin url from original or empty string>",
    "portfolio": "<portfolio/github url from original or empty string>"
  },
  "summary": "<3 sentences — expertise overview | signature achievement | employer value prop — keyword-dense for ${role}>",
  "experience": [
    {
      "title": "<exact job title — do not change>",
      "company": "<exact company name — do not change>",
      "location": "<city, country>",
      "startDate": "<Month Year>",
      "endDate": "<Month Year or Present>",
      "bullets": [
        "<Powerful Verb + Specific Action + Quantified Result>",
        "<Powerful Verb + Specific Action + Quantified Result>",
        "<Powerful Verb + Specific Action + Quantified Result>",
        "<Powerful Verb + Specific Action + Quantified Result>",
        "<Powerful Verb + Specific Action + Quantified Result>"
      ]
    }
  ],
  "education": [
    {
      "degree": "<Full degree and field — rewrite if vague but keep institution>",
      "school": "<exact institution name — do not change>",
      "location": "<City, Country>",
      "year": "<graduation year>",
      "gpa": "<GPA if in original, else empty string>",
      "honors": "<honors, distinctions, relevant coursework if mentioned, else empty string>"
    }
  ],
  "skills": {
    "technical": ["<10+ technical skills for ${role} in ${field}>"],
    "soft": ["<5+ soft skills for ${level}-level ${role}>"],
    "tools": ["<6+ tools, software, platforms for ${role}>"]
  },
  "certifications": ["<Certification Name — Issuing Organization (Year)>"],
  "injectedKeywords": ["<every keyword from missing list that was integrated>"],
  "predictedScore": <realistic ATS score between 88-96>,
  "improvements": [
    "<Specific improvement #1 made in this rewrite>",
    "<Specific improvement #2>",
    "<Specific improvement #3>",
    "<Specific improvement #4>",
    "<Specific improvement #5>"
  ]
}`;

  try {
    console.log(`🤖 Building [${mode}] resume → Role: "${role}" | Field: ${field} | Level: ${level} | Style: ${style}`);

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: 'You are an expert professional resume writer. Always respond with valid JSON only. No markdown, no backticks, no explanation, no preamble, no extra text of any kind.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.25,
        max_tokens: 4096
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

    const raw     = data.choices?.[0]?.message?.content || '';
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    console.log('✅ Raw response preview:', raw.slice(0, 200));

    if (!raw) return res.status(500).json({ error: 'Empty response from AI.' });

    try {
      const result = JSON.parse(cleaned);
      console.log(`✅ ATS resume built! Predicted score: ${result.predictedScore}/100`);
      res.json(result);
    } catch (parseErr) {
      console.error('❌ JSON Parse Error:', parseErr.message);
      console.error('Attempted to parse:', cleaned.slice(0, 300));
      res.status(500).json({ error: 'AI returned invalid JSON: ' + parseErr.message });
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
    res.status(500).json({ error: 'Resume build failed: ' + err.message });
  }
});

app.listen(PORT, () => {
  console.log('');
  console.log('✅ Server is running!');
  console.log('👉 Open this link in browser: http://localhost:' + PORT);
  console.log('');
});
import OpenAI from 'openai';
import nodemailer from 'nodemailer';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { text, userEmail } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }
    
    console.log('Processing text:', text);
    
    // AI analýza
    const analysis = await analyzeTask(text);
    console.log('Analysis completed:', analysis);
    
    // Email
    if (userEmail) {
      await sendEmail(userEmail, analysis, text);
      console.log('Email sent to:', userEmail);
    }
    
    return res.status(200).json({ 
      success: true, 
      text,
      analysis 
    });
    
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ 
      error: error.message
    });
  }
}

async function analyzeTask(text) {
  const prompt = `
Uživatel napsal úkol: "${text}"

Aplikuj produktivní principy a odpověz v JSON formátu:

{
  "priority": 1-5,
  "isParetoTask": true/false,
  "firstStep": "Konkrétní malý první krok",
  "timeEstimate": "Odhad času",
  "category": "práce/osobní/zdraví/finance",
  "analysis": "Zdůvodnění podle Pareto principu",
  "actionPlan": ["krok 1", "krok 2", "krok 3"]
}

Odpověz pouze JSON.
`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
  });

  const response = completion.choices[0].message.content;
  const cleaned = response.replace(/```json\n?|\n?```/g, '').trim();
  return JSON.parse(cleaned);
}

async function sendEmail(userEmail, analysis, originalText) {
  const transporter = nodemailer.createTransporter({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  const emailContent = `
🎯 ANALÝZA ÚKOLU

📋 Úkol: "${originalText}"
🎯 Priorita: ${analysis.priority}/5
${analysis.isParetoTask ? '⭐ PARETO ÚKOL!' : ''}

✅ První krok: ${analysis.firstStep}
⏱️ Čas: ${analysis.timeEstimate}
📂 Kategorie: ${analysis.category}

📝 Akční plán:
${analysis.actionPlan.map((step, i) => `${i + 1}. ${step}`).join('\n')}

💡 Analýza: ${analysis.analysis}
  `;

  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: userEmail,
    subject: `🎯 Úkol: Priorita ${analysis.priority}/5`,
    text: emailContent
  });
}

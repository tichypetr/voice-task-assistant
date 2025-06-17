import OpenAI from 'openai';
import nodemailer from 'nodemailer';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  // CORS headers
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
    const { audioBase64, text, userEmail } = req.body;
    
    console.log('Received request:', { hasAudio: !!audioBase64, hasText: !!text, userEmail });
    
    let transcription = '';
    
    // Pokud máme audio, převedeme na text
    if (audioBase64) {
      transcription = await transcribeAudio(audioBase64);
    } else if (text) {
      // Pro testování můžeme poslat přímo text
      transcription = text;
    } else {
      return res.status(400).json({ error: 'Potřebujeme buď audio nebo text' });
    }
    
    console.log('Transcription:', transcription);
    
    // AI analýza podle Pareto principů
    const analysis = await analyzeTask(transcription);
    
    console.log('Analysis completed:', analysis);
    
    // Poslání emailu s analýzou
    if (userEmail) {
      await sendEmail(userEmail, analysis, transcription);
      console.log('Email sent to:', userEmail);
    }
    
    return res.status(200).json({ 
      success: true, 
      transcription,
      analysis 
    });
    
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ 
      error: error.message,
      stack: error.stack 
    });
  }
}

async function transcribeAudio(audioBase64) {
  try {
    // Převod base64 na buffer
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    
    // Vytvoření dočasného souboru pro Whisper API
    const transcription = await openai.audio.transcriptions.create({
      file: new File([audioBuffer], 'audio.wav', { type: 'audio/wav' }),
      model: "whisper-1",
      language: "cs"
    });
    
    return transcription.text;
  } catch (error) {
    console.error('Transcription error:', error);
    throw new Error(`Chyba při převodu audio na text: ${error.message}`);
  }
}

async function analyzeTask(text) {
  try {
    const prompt = `
Uživatel nadiktoval úkol: "${text}"

Aplikuj produktivní principy (Pareto princip, Zeigarnik efekt, Championship mentality) a odpověz v JSON formátu:

{
  "priority": 1-5 (5 = nejvyšší),
  "isParetoTask": true/false (je to v top 20% důležitých věcí?),
  "firstStep": "Konkrétní malý první krok (Zeigarnik efekt)",
  "timeEstimate": "Odhad času",
  "category": "práce/osobní/zdraví/finance/učení",
  "needsCalendarEvent": true/false,
  "suggestedDateTime": "YYYY-MM-DD HH:MM" nebo null,
  "analysis": "Krátké zdůvodnění priority podle Pareto principu",
  "actionPlan": ["krok 1", "krok 2", "krok 3"],
  "paretoSquared": "Co je 20% z tohoto úkolu, co přinese 80% výsledku?",
  "championshipVsGame": "Je to dlouhodobý cíl (šampionát) nebo krátkodobý úkol (hra)?"
}

Zaměř se na:
- Pareto princip: Je to ve 20% nejdůležitějších aktivit?
- Zeigarnik efekt: Jaký je nejmenší možný první krok?
- Championship mentality: Je lepší "prohrát hru aby vyhrál šampionát"?
- Rozděl na menší části podle Pareto²

Odpověz pouze JSON, bez dalšího textu.
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    });

    const response = completion.choices[0].message.content;
    console.log('Raw AI response:', response);
    
    // Pokusíme se parsovat JSON
    const cleaned = response.replace(/```json\n?|\n?```/g, '').trim();
    return JSON.parse(cleaned);
    
  } catch (error) {
    console.error('Analysis error:', error);
    throw new Error(`Chyba při AI analýze: ${error.message}`);
  }
}

async function sendEmail(userEmail, analysis, originalText) {
  try {
    const transporter = nodemailer.createTransporter({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    const priorityEmoji = analysis.priority >= 4 ? '🔥' : analysis.priority >= 3 ? '⚡' : '📝';
    const paretoEmoji = analysis.isParetoTask ? '⭐ PARETO ÚKOL!' : '';

    const emailContent = `
${priorityEmoji} ANALÝZA ÚKOLU ${paretoEmoji}

📋 Původní text: "${originalText}"

🎯 Priorita: ${analysis.priority}/5 
${analysis.isParetoTask ? '⭐ JE TO PARETO ÚKOL (top 20%)!' : ''}

✅ PRVNÍ KROK (začni hned): 
${analysis.firstStep}

⏱️ Odhad času: ${analysis.timeEstimate}
📂 Kategorie: ${analysis.category}

🧠 PARETO² ANALÝZA:
${analysis.paretoSquared}

🏆 CHAMPIONSHIP VS GAME:
${analysis.championshipVsGame}

📊 Zdůvodnění priority: 
${analysis.analysis}

📝 AKČNÍ PLÁN:
${analysis.actionPlan.map((step, index) => `${index + 1}. ${step}`).join('\n')}

${analysis.needsCalendarEvent ? `📅 Navrhovaný čas: ${analysis.suggestedDateTime}` : ''}

---
🚀 Produktivní tipy:
• Začni prvním krokem během 2 minut (Zeigarnik efekt)
• Zaměř se na Pareto úkoly (80% výsledku z 20% času)
• Pamatuj na dlouhodobé cíle vs. krátkodobé "hry"
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: userEmail,
      subject: `${priorityEmoji} Úkol analyzován: Priorita ${analysis.priority}/5 ${paretoEmoji}`,
      text: emailContent
    });

  } catch (error) {
    console.error('Email error:', error);
    throw new Error(`Chyba při posílání emailu: ${error.message}`);
  }
}

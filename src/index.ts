import OpenAI from "openai";
import { Resend } from "resend";

// ── Config ────────────────────────────────────────────────────────────────────

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const TO_EMAIL = process.env.TO_EMAIL ?? "omri.reuter@gmail.com";
const FROM_EMAIL = process.env.FROM_EMAIL ?? "onboarding@resend.dev";

// Tel Aviv coordinates
const LAT = 32.08;
const LON = 34.78;

// ── Types ─────────────────────────────────────────────────────────────────────

interface WeatherDay {
  date: string;
  maxTemp: number;
  minTemp: number;
  precipitation: number;
  description: string;
}

// WMO weather interpretation codes → human-readable
const WMO_CODES: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Foggy",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  71: "Slight snow",
  73: "Moderate snow",
  75: "Heavy snow",
  80: "Slight showers",
  81: "Moderate showers",
  82: "Violent showers",
  95: "Thunderstorm",
  99: "Thunderstorm with hail",
};

// ── Weather fetch ─────────────────────────────────────────────────────────────

async function fetchWeather(): Promise<WeatherDay[]> {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${LAT}&longitude=${LON}` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode` +
    `&timezone=Asia/Jerusalem&forecast_days=7`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Weather API error: ${res.status}`);

  const data = (await res.json()) as {
    daily: {
      time: string[];
      temperature_2m_max: number[];
      temperature_2m_min: number[];
      precipitation_sum: number[];
      weathercode: number[];
    };
  };

  return data.daily.time.map((date, i) => ({
    date,
    maxTemp: Math.round(data.daily.temperature_2m_max[i]),
    minTemp: Math.round(data.daily.temperature_2m_min[i]),
    precipitation: data.daily.precipitation_sum[i],
    description: WMO_CODES[data.daily.weathercode[i]] ?? "Unknown",
  }));
}

// ── Weather emoji + color helpers ────────────────────────────────────────────

function weatherEmoji(description: string): string {
  const d = description.toLowerCase();
  if (d.includes("thunder")) return "⛈️";
  if (d.includes("snow")) return "❄️";
  if (d.includes("heavy rain") || d.includes("violent")) return "🌧️";
  if (d.includes("rain") || d.includes("drizzle") || d.includes("shower")) return "🌦️";
  if (d.includes("fog")) return "🌫️";
  if (d.includes("overcast")) return "☁️";
  if (d.includes("partly cloudy")) return "⛅";
  if (d.includes("mainly clear")) return "🌤️";
  return "☀️";
}

function tempColor(temp: number): string {
  if (temp >= 35) return "#e53e3e";
  if (temp >= 28) return "#dd6b20";
  if (temp >= 20) return "#d69e2e";
  if (temp >= 12) return "#38a169";
  return "#3182ce";
}

function formatDayLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((date.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return date.toLocaleDateString("en-US", { weekday: "long" });
}

// ── HTML email template ───────────────────────────────────────────────────────

function buildHtmlEmail(days: WeatherDay[], intro: string): string {
  const dayCards = days
    .map((d) => {
      const label = formatDayLabel(d.date);
      const emoji = weatherEmoji(d.description);
      const maxColor = tempColor(d.maxTemp);
      const rain = d.precipitation > 0
        ? `<div style="margin-top:4px;font-size:12px;color:#718096;">💧 ${d.precipitation}mm</div>`
        : "";
      return `
      <div style="background:#ffffff;border-radius:12px;padding:16px 20px;margin-bottom:10px;
                  display:flex;align-items:center;justify-content:space-between;
                  box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <div style="display:flex;align-items:center;gap:12px;">
          <span style="font-size:28px;line-height:1;">${emoji}</span>
          <div>
            <div style="font-weight:600;font-size:15px;color:#2d3748;">${label}</div>
            <div style="font-size:12px;color:#718096;margin-top:2px;">${d.date}</div>
            <div style="font-size:13px;color:#4a5568;margin-top:4px;">${d.description}</div>
            ${rain}
          </div>
        </div>
        <div style="text-align:right;">
          <span style="font-size:22px;font-weight:700;color:${maxColor};">${d.maxTemp}°</span>
          <span style="font-size:14px;color:#a0aec0;margin-left:4px;">/ ${d.minTemp}°</span>
        </div>
      </div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f7fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:520px;margin:32px auto;padding:0 16px;">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#667eea,#764ba2);border-radius:16px;
                padding:28px 24px;margin-bottom:20px;text-align:center;">
      <div style="font-size:36px;margin-bottom:8px;">🌍</div>
      <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Tel Aviv Weather</h1>
      <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">7-day forecast</p>
    </div>

    <!-- Intro -->
    <div style="background:#ffffff;border-radius:12px;padding:16px 20px;margin-bottom:16px;
                box-shadow:0 1px 3px rgba(0,0,0,0.08);font-size:14px;color:#4a5568;line-height:1.6;">
      ${intro}
    </div>

    <!-- Day cards -->
    ${dayCards}

    <!-- Footer -->
    <p style="text-align:center;font-size:12px;color:#a0aec0;margin-top:24px;">
      Data from Open-Meteo · Sent by your weather agent
    </p>
  </div>
</body>
</html>`;
}

// ── Email body generation ─────────────────────────────────────────────────────

async function generateEmail(days: WeatherDay[]): Promise<{ html: string; text: string }> {
  let intro = "Here's your Tel Aviv forecast for the week ahead.";

  if (OPENAI_API_KEY) {
    const client = new OpenAI({ apiKey: OPENAI_API_KEY });
    const today = days[0];
    const prompt =
      `Today in Tel Aviv: ${today.description}, ${today.minTemp}–${today.maxTemp}°C` +
      (today.precipitation > 0 ? `, ${today.precipitation}mm of rain expected` : "") +
      `. Write one short, friendly sentence recommending what to wear today. No greeting, just the sentence.`;

    const res = await client.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 80,
      messages: [{ role: "user", content: prompt }],
    });

    intro = res.choices[0]?.message?.content?.trim() ?? intro;
  }

  const html = buildHtmlEmail(days, intro);

  const text = days
    .map((d) => `${formatDayLabel(d.date)} (${d.date}): ${d.description}, ${d.minTemp}–${d.maxTemp}°C` +
      (d.precipitation > 0 ? `, ${d.precipitation}mm rain` : ""))
    .join("\n");

  return { html, text: `${intro}\n\n${text}` };
}

// ── Send email ────────────────────────────────────────────────────────────────

async function sendEmail(html: string, text: string, days: WeatherDay[]): Promise<void> {
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY is not set");

  const resend = new Resend(RESEND_API_KEY);

  const startDate = days[0].date;
  const subject = `☀️ Tel Aviv Weather — Week of ${startDate}`;

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: TO_EMAIL,
    subject,
    html,
    text,
  });

  if (error) throw new Error(`Resend error: ${JSON.stringify(error)}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Fetching Tel Aviv weather...");
  const days = await fetchWeather();
  console.log(`Got ${days.length} days of forecast`);

  console.log("Generating email...");
  const { html, text } = await generateEmail(days);

  console.log("Sending email...");
  await sendEmail(html, text, days);

  console.log(`Email sent to ${TO_EMAIL}`);
}

main().catch((err) => {
  console.error("Agent failed:", err);
  process.exit(1);
});

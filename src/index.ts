import Anthropic from "@anthropic-ai/sdk";
import { Resend } from "resend";

// ── Config ────────────────────────────────────────────────────────────────────

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
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

// ── Email body generation ─────────────────────────────────────────────────────

function formatWeatherFallback(days: WeatherDay[]): string {
  const rows = days
    .map(
      (d) =>
        `${d.date}  |  ${d.description.padEnd(20)}  |  ${d.minTemp}°–${d.maxTemp}°C` +
        (d.precipitation > 0 ? `  |  ${d.precipitation}mm rain` : "")
    )
    .join("\n");

  return `Tel Aviv 7-Day Forecast\n${"─".repeat(60)}\n${rows}\n\nHave a great week!`;
}

async function generateEmailBody(days: WeatherDay[]): Promise<string> {
  if (!ANTHROPIC_API_KEY) {
    return formatWeatherFallback(days);
  }

  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  const forecast = days
    .map(
      (d) =>
        `${d.date}: ${d.description}, ${d.minTemp}–${d.maxTemp}°C, ${d.precipitation}mm rain`
    )
    .join("\n");

  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content: `You are writing a friendly daily weather briefing email for Tel Aviv.

Here is the raw 7-day forecast:
${forecast}

Write a short, friendly email body (plain text, no markdown) that:
- Opens with a one-sentence summary of the week's weather character
- Lists each day concisely (date, emoji, temp range, any rain)
- Closes with a practical tip if there's anything notable (heat wave, rain, etc.)
- Keeps it under 200 words total

No subject line, no greeting — just the body.`,
      },
    ],
  });

  const block = msg.content[0];
  return block.type === "text" ? block.text : formatWeatherFallback(days);
}

// ── Send email ────────────────────────────────────────────────────────────────

async function sendEmail(body: string, days: WeatherDay[]): Promise<void> {
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY is not set");

  const resend = new Resend(RESEND_API_KEY);

  const startDate = days[0].date;
  const subject = `☀️ Tel Aviv Weather — Week of ${startDate}`;

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: TO_EMAIL,
    subject,
    text: body,
  });

  if (error) throw new Error(`Resend error: ${JSON.stringify(error)}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Fetching Tel Aviv weather...");
  const days = await fetchWeather();
  console.log(`Got ${days.length} days of forecast`);

  console.log("Generating email body...");
  const body = await generateEmailBody(days);

  console.log("Sending email...");
  await sendEmail(body, days);

  console.log(`Email sent to ${TO_EMAIL}`);
}

main().catch((err) => {
  console.error("Agent failed:", err);
  process.exit(1);
});

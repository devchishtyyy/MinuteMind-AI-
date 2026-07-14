// All Gemini calls are proxied through the backend (backend/routes/gemini.js) so the
// real API key never ships to the browser. See backend/server.js for the server that
// serves this endpoint alongside the built SPA.

async function callGemini<T>(endpoint: string, body: unknown): Promise<T> {
  const res = await fetch(`/api/gemini/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Gemini proxy request to ${endpoint} failed (${res.status})`);
  }
  const data = await res.json();
  return data.result as T;
}

export async function describeMeeting(minutes: string) {
  try {
    return await callGemini<string>("describe-meeting", { minutes });
  } catch (error) {
    console.error("Error generating meeting description:", error);
    return "Failed to generate description. Please try again.";
  }
}

export async function extractMeetingName(minutes: string) {
  try {
    return await callGemini<string>("extract-meeting-name", { minutes });
  } catch (error) {
    console.error("Error extracting meeting name:", error);
    return "Untitled Meeting";
  }
}

export async function findRelevantMeetings(query: string, meetings: { id: string, title?: string, name?: string, rawMinutes?: string, minutes?: string }[]) {
  try {
    return await callGemini<string[]>("find-relevant-meetings", { query, meetings });
  } catch (error) {
    console.error("AI Search failed:", error);
    return [];
  }
}

export async function analyzeMeetingMinutes(minutes: string, metadata?: { company?: string, category?: string, attachments?: any[] }) {
  try {
    return await callGemini<any>("analyze-meeting-minutes", { minutes, metadata });
  } catch (error) {
    console.error("AI Analysis failed:", error);
    throw error;
  }
}

export async function askAboutMeetings(question: string, meetings: any[]) {
  try {
    return await callGemini<string>("ask-about-meetings", { question, meetings });
  } catch (error) {
    console.error("Failed to answer question about meetings:", error);
    throw error;
  }
}

export async function generateSmartBriefing(
  meetingType: string,
  previousMeeting: {
    title: string,
    date: string,
    aiSummary?: string,
    keyDecisions?: string[],
    actionItems?: any[]
  }
) {
  try {
    return await callGemini<string>("generate-smart-briefing", { meetingType, previousMeeting });
  } catch (error) {
    console.error("Failed to generate smart briefing:", error);
    throw error;
  }
}

export async function askCorporateMemory(
  question: string,
  meetings: any[],
  history: { role: 'user' | 'model', text: string }[]
) {
  try {
    return await callGemini<string>("ask-corporate-memory", { question, meetings, history });
  } catch (error) {
    console.error("Corporate memory search failure:", error);
    throw error;
  }
}

export async function generateEmailSummary(meeting: any) {
  try {
    return await callGemini<string>("generate-email-summary", { meeting });
  } catch (error) {
    console.error("Failed to generate email summary:", error);
    throw error;
  }
}

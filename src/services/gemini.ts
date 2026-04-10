import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function describeMeeting(minutes: string) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are a professional meeting assistant. Based on the following meeting minutes, provide a concise, high-level description of the meeting. Focus on the main topics discussed, key decisions made, and any action items. Use a professional and clear tone.

Minutes:
${minutes}`,
    });
    return response.text || "No description generated.";
  } catch (error) {
    console.error("Error generating meeting description:", error);
    return "Failed to generate description. Please try again.";
  }
}

export async function extractMeetingName(minutes: string) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Extract a concise and professional title for a meeting based on these minutes. If a title is explicitly mentioned, use it. Otherwise, infer one. Return ONLY the title string.

Minutes:
${minutes}`,
    });
    return response.text?.trim() || "Untitled Meeting";
  } catch (error) {
    console.error("Error extracting meeting name:", error);
    return "Untitled Meeting";
  }
}

export async function findRelevantMeetings(query: string, meetings: { id: string, name: string, minutes: string }[]) {
  try {
    const meetingContext = meetings.map(m => ({
      id: m.id,
      name: m.name,
      snippet: m.minutes.substring(0, 500) // Send snippets to save tokens
    }));

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      config: {
        responseMimeType: "application/json",
      },
      contents: `You are a meeting search assistant. A user is looking for meetings based on this description: "${query}".
      
      Here is a list of available meetings (ID, Name, and Snippet):
      ${JSON.stringify(meetingContext)}
      
      Identify the IDs of the meetings that most closely match the user's description. If multiple meetings are relevant, return all of them in order of relevance. If none are relevant, return an empty array.
      
      Return the result as a JSON array of strings (the IDs).`,
    });
    
    const text = response.text || "[]";
    try {
      return JSON.parse(text.trim()) as string[];
    } catch (e) {
      console.error("Failed to parse AI search results:", text);
      return [];
    }
  } catch (error) {
    console.error("AI Search failed:", error);
    return [];
  }
}

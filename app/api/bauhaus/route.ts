import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ean = searchParams.get("ean");

  if (!ean) {
    return NextResponse.json({ error: "EAN krävs" }, { status: 400 });
  }

  try {
    const targetUrl = `https://www.bauhaus.se/catalogsearch/result/?q=${encodeURIComponent(ean)}`;
    
    const res = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "sv-SE,sv;q=0.9",
      },
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      return NextResponse.json({ found: false, message: "Kunde inte kontakta Bauhaus" });
    }

    const html = await res.text();

    // Rensa bort HTML-entiteter som &#039;
    const cleanHtml = html.replace(/&#039;/g, "'").replace(/&quot;/g, '"');

    // Sök efter produktnamn i meta-taggar eller produktkort
    let title = "";

    // Försök hitta produktnamn i OpenGraph-titel
    const ogMatch = cleanHtml.match(/<meta property="og:title" content="([^"]+)"/i);
    if (ogMatch && !ogMatch[1].includes("Visar sökresultat") && !ogMatch[1].includes("Sökresultat")) {
      title = ogMatch[1].trim();
    }

    // Om inte hittat, sök efter produktlänk
    if (!title) {
      const cardMatch = cleanHtml.match(/class="product-item-link"[^>]*>\s*([^<]+)/i);
      if (cardMatch) {
        title = cardMatch[1].trim();
      }
    }

    // Om titeln fortfarande innehåller "Visar sökresultat" så räknas det INTE som en träff
    if (title && !title.toLowerCase().includes("sökresultat") && !title.toLowerCase().includes("visar")) {
      return NextResponse.json({ found: true, title, ean });
    } else {
      return NextResponse.json({ found: false, message: "Ingen produkttillhörighet hittades på Bauhaus" });
    }
  } catch (error) {
    console.error("Fel vid Bauhaus-uppslag:", error);
    return NextResponse.json({ found: false, error: "Serverfel vid uppslag" }, { status: 500 });
  }
}

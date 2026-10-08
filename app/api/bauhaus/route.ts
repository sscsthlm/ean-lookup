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
      next: { revalidate: 3600 }, // Cacha sökresultat i 1 timme
    });

    if (!res.ok) {
      return NextResponse.json({ found: false, message: "Kunde inte kontakta Bauhaus" });
    }

    const html = await res.text();

    // Sök efter produkttitel i HTML-sidan
    // Bauhaus använder ofta <title> eller specifika meta/itemprop-taggar för sökresultat
    let titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/i) ||
                     html.match(/<title>([^<]+)<\/title>/i);

    let title = titleMatch ? titleMatch[1].trim() : "";

    // Tvätta bort sök-suffix som "Sökresultat för..." om det inte hittades en enskild produktsida
    if (title.includes("Sökresultat") || title.includes("BAUHAUS")) {
      // Försök hitta produktkortstitel i listan
      const productCardMatch = html.match(/class="product-item-link"[^>]*>\s*([^<]+)/i) ||
                               html.match(/class="product name product-item-name"[^>]*>[\s\S]*?title="([^"]+)"/i);
      if (productCardMatch) {
        title = productCardMatch[1].trim();
      } else {
        title = "";
      }
    }

    if (title) {
      return NextResponse.json({ found: true, title, ean });
    } else {
      return NextResponse.json({ found: false, message: "Ingen träff på Bauhaus" });
    }
  } catch (error) {
    console.error("Fel vid Bauhaus-uppslag:", error);
    return NextResponse.json({ found: false, error: "Serverfel vid uppslag" }, { status: 500 });
  }
}

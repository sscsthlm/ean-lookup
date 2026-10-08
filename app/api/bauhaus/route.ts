import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ean = searchParams.get("ean");

  if (!ean) {
    return NextResponse.json({ error: "EAN krävs" }, { status: 400 });
  }

  try {
    const cleanEan = ean.trim();
    // Vi anropar Bauhaus interna söktjänst direkt
    const targetUrl = `https://www.bauhaus.se/search/ajax/suggest/?q=${encodeURIComponent(cleanEan)}`;

    const res = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "X-Requested-With": "XMLHttpRequest",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "sv-SE,sv;q=0.9",
      },
      next: { revalidate: 3600 }, // Cacha resultatet 1 timme för extra snabbhet
    });

    if (!res.ok) {
      // Om autokomplettering-endpointen ger ett fel, gör en fallback till katalogsök
      return await fallbackCatalogSearch(cleanEan);
    }

    const data = await res.json();

    // Kolla om vi fick några produktförslag i responset
    if (Array.isArray(data) && data.length > 0) {
      const firstHit = data[0];
      const title = firstHit.title || firstHit.name || firstHit.label;

      if (title) {
        return NextResponse.json({ found: true, title: title.trim(), ean: cleanEan });
      }
    }

    // Om autokompletteringen var tom, testa fallback
    return await fallbackCatalogSearch(cleanEan);
  } catch (error) {
    console.error("Fel vid Bauhaus-uppslag:", error);
    return NextResponse.json({ found: false, error: "Serverfel vid uppslag" }, { status: 500 });
  }
}

// Fallback om ajax-förslaget inte gav direkt respons
async function fallbackCatalogSearch(ean: string) {
  try {
    const fallbackUrl = `https://www.bauhaus.se/catalogsearch/result/?q=${encodeURIComponent(ean)}`;
    const res = await fetch(fallbackUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
    });

    if (!res.ok) {
      return NextResponse.json({ found: false, message: "Ingen kontakt med Bauhaus" });
    }

    const html = await res.text();

    // Sök ut produktnamnet ur länkstrukturen
    const productMatch = html.match(/class="product-item-link"[^>]*>\s*([^<]+)/i) ||
                         html.match(/data-product-name="([^"]+)"/i);

    if (productMatch && productMatch[1]) {
      const cleanTitle = productMatch[1].trim();
      if (!cleanTitle.toLowerCase().includes("sökresultat") && !cleanTitle.toLowerCase().includes("visar")) {
        return NextResponse.json({ found: true, title: cleanTitle, ean });
      }
    }

    return NextResponse.json({ found: false, message: "Artikeln hittades inte i Bauhaus sortiment" });
  } catch (e) {
    return NextResponse.json({ found: false, message: "Kunde inte slå upp artikeln" });
  }
}

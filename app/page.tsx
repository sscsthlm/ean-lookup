"use client";

import { useState, useEffect } from "react";
import { db } from "../lib/firebase";
import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
  writeBatch,
  doc,
  deleteDoc,
} from "firebase/firestore";

interface EanItem {
  id: string;
  oldEan: string;
  newEan: string;
  productName?: string;
  supplier?: string;
}

export default function Home() {
  const [items, setItems] = useState<EanItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState("Alla");

  // Öppet snabbuppslag för alla användare (ej admin)
  const [quickEan, setQuickEan] = useState("");
  const [quickTitle, setQuickTitle] = useState("");
  const [quickImage, setQuickImage] = useState<string | null>(null);
  const [quickMessage, setQuickMessage] = useState("");
  const [isQuickLookingUp, setIsQuickLookingUp] = useState(false);

  // Admin states
  const [isAdmin, setIsAdmin] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);

  // Formulärstater för enskild manuell inmatning i Admin
  const [oldEan, setOldEan] = useState("");
  const [newEan, setNewEan] = useState("");
  const [productName, setProductName] = useState("");
  const [supplier, setSupplier] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupMsg, setLookupMsg] = useState("");

  // Massimport / Batch-import stater
  const [importTab, setImportTab] = useState<"single" | "batch">("single");
  const [batchText, setBatchText] = useState("");
  const [batchSupplier, setBatchSupplier] = useState("");
  const [batchStatus, setBatchStatus] = useState("");

  // Inställd PIN-kod
  const ADMIN_PIN = "1234";

  // Hämta data från Firestore
  const fetchItems = async () => {
    try {
      const q = query(collection(db, "ean_mappings"), orderBy("createdAt", "desc"));
      const querySnapshot = await getDocs(q);
      const fetchedItems: EanItem[] = [];
      querySnapshot.forEach((docSnap) => {
        fetchedItems.push({ id: docSnap.id, ...docSnap.data() } as EanItem);
      });
      setItems(fetchedItems);
    } catch (error) {
      console.error("Fel vid hämtning av data:", error);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  // Lås upp admin med PIN
  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput === ADMIN_PIN) {
      setIsAdmin(true);
      setShowPinModal(false);
      setPinInput("");
      setPinError(false);
    } else {
      setPinError(true);
    }
  };

  // Öppet snabbuppslag på Bauhaus
  const handleQuickLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickEan.trim()) return;

    setIsQuickLookingUp(true);
    setQuickMessage("Söker hos Bauhaus...");
    setQuickTitle("");
    setQuickImage(null);

    try {
      const res = await fetch(`/api/bauhaus?ean=${encodeURIComponent(quickEan.trim())}`);
      const data = await res.json();

      if (data.found && data.title) {
        setQuickTitle(data.title);
        setQuickImage(data.image || null);
        setQuickMessage("");
      } else {
        setQuickMessage("❌ Ingen produkt hittades hos Bauhaus med denna EAN-kod.");
      }
    } catch (err) {
      console.error("Uppslagsfel:", err);
      setQuickMessage("⚠️ Det gick inte att slå upp produkten.");
    } finally {
      setIsQuickLookingUp(false);
    }
  };

  // Slå upp EAN i Admin-formuläret
  const lookupBauhaus = async (targetEan: string) => {
    if (!targetEan.trim()) {
      setLookupMsg("Fyll i ett EAN-nummer först.");
      return;
    }

    setIsLookingUp(true);
    setLookupMsg("Söker hos Bauhaus...");

    try {
      const res = await fetch(`/api/bauhaus?ean=${encodeURIComponent(targetEan.trim())}`);
      const data = await res.json();

      if (data.found && data.title) {
        setProductName(data.title);
        setLookupMsg(`Hittades: "${data.title}"`);
      } else {
        setLookupMsg("Ingen matchning hittades hos Bauhaus.");
      }
    } catch (err) {
      console.error("Uppslagsfel:", err);
      setLookupMsg("Fel vid anrop till Bauhaus.");
    } finally {
      setIsLookingUp(false);
    }
  };

  // Lägg till enskild EAN-ersättning
  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldEan || !newEan) return;

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, "ean_mappings"), {
        oldEan: oldEan.trim(),
        newEan: newEan.trim(),
        productName: productName.trim() || "-",
        supplier: supplier.trim() || "Övrigt",
        createdAt: serverTimestamp(),
      });

      setOldEan("");
      setNewEan("");
      setProductName("");
      setSupplier("");
      setLookupMsg("");

      fetchItems();
    } catch (error) {
      console.error("Fel vid sparning:", error);
      alert("Det gick inte att spara. Kontrollera Firebase-anslutningen.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Importera flera rader samtidigt från Excel / Text
  const handleBatchImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchText.trim()) return;

    setIsSubmitting(true);
    setBatchStatus("Bearbetar rader...");

    try {
      const lines = batchText.split("\n");
      const batch = writeBatch(db);
      let count = 0;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const parts = trimmed.split(/[\t;,]+/).map((p) => p.trim());
        if (parts.length >= 2) {
          const oldEanVal = parts[0];
          const newEanVal = parts[1];
          const nameVal = parts[2] || "-";

          if (oldEanVal && newEanVal) {
            const newDocRef = doc(collection(db, "ean_mappings"));
            batch.set(newDocRef, {
              oldEan: oldEanVal,
              newEan: newEanVal,
              productName: nameVal,
              supplier: batchSupplier.trim() || "Övrigt",
              createdAt: serverTimestamp(),
            });
            count++;
          }
        }
      }

      if (count > 0) {
        await batch.commit();
        setBatchStatus(`Framgång! Importerade ${count} st EAN-ersättningar.`);
        setBatchText("");
        setBatchSupplier("");
        fetchItems();
      } else {
        setBatchStatus("Hittade inga giltiga rader. Kontrollera formatet (GammaltEAN [Tab/Komma] NyttEAN).");
      }
    } catch (error) {
      console.error("Fel vid massimport:", error);
      setBatchStatus("Ett fel uppstod vid importen.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Ta bort en EAN-ersättning
  const handleDeleteItem = async (id: string) => {
    if (!confirm("Är du säker på att du vill ta bort den här ersättningen?")) return;

    try {
      await deleteDoc(doc(db, "ean_mappings", id));
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (error) {
      console.error("Fel vid borttagning:", error);
      alert("Det gick inte att ta bort raden.");
    }
  };

  const suppliers = [
    "Alla",
    ...Array.from(new Set(items.map((i) => i.supplier).filter((s): s is string => Boolean(s)))),
  ];

  const filteredItems = items.filter((item) => {
    const pName = item.productName || "";
    const sup = item.supplier || "";

    const matchesSearch =
      item.oldEan.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.newEan.toLowerCase().includes(searchTerm.toLowerCase()) ||
      pName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sup.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesSupplier =
      selectedSupplier === "Alla" || item.supplier === selectedSupplier;

    return matchesSearch && matchesSupplier;
  });

  return (
    <main style={{ maxWidth: "900px", margin: "0 auto", padding: "20px", fontFamily: "sans-serif" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h1>EAN-Ersättningar</h1>
        <button
          onClick={() => {
            if (isAdmin) {
              setIsAdmin(false);
            } else {
              setShowPinModal(true);
            }
          }}
          style={{
            background: isAdmin ? "#e53e3e" : "#3182ce",
            color: "#fff",
            border: "none",
            padding: "8px 16px",
            borderRadius: "6px",
            cursor: "pointer",
            fontSize: "16px",
          }}
        >
          {isAdmin ? "🔒 Lås Admin" : "🔓 Admin-inloggning"}
        </button>
      </div>

      {/* ÖPPET SNABBUPPSLAG MED BILD */}
      <div style={{ background: "#ebf8ff", border: "1px solid #90cdf4", padding: "16px", borderRadius: "8px", marginBottom: "25px" }}>
        <h3 style={{ margin: "0 0 10px 0", fontSize: "16px", color: "#2b6cb0" }}>
          🔍 Slå upp EAN direkt hos Bauhaus
        </h3>
        <form onSubmit={handleQuickLookup} style={{ display: "flex", gap: "10px" }}>
          <input
            type="text"
            placeholder="Skriv in EAN-kod..."
            value={quickEan}
            onChange={(e) => setQuickEan(e.target.value)}
            style={{ flex: 1, padding: "10px", borderRadius: "6px", border: "1px solid #cbd5e0" }}
          />
          <button
            type="submit"
            disabled={isQuickLookingUp}
            style={{
              padding: "10px 18px",
              background: "#3182ce",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontWeight: "bold",
              whiteSpace: "nowrap",
            }}
          >
            {isQuickLookingUp ? "Söker..." : "Slå upp vara"}
          </button>
        </form>

        {quickMessage && (
          <p style={{ marginTop: "12px", fontWeight: "bold", color: "#4a5568" }}>
            {quickMessage}
          </p>
        )}

        {quickTitle && (
          <div style={{ marginTop: "15px", padding: "12px", background: "#fff", borderRadius: "8px", border: "1px solid #cbd5e0", display: "flex", alignItems: "center", gap: "15px" }}>
            {quickImage && (
              <img
                src={quickImage}
                alt={quickTitle}
                style={{ width: "80px", height: "80px", objectFit: "contain", borderRadius: "6px", border: "1px solid #edf2f7" }}
              />
            )}
            <div>
              <span style={{ fontSize: "12px", color: "#718096", textTransform: "uppercase", fontWeight: "bold" }}>Produkt hos Bauhaus</span>
              <h4 style={{ margin: "4px 0 0 0", fontSize: "16px", color: "#2d3748" }}>{quickTitle}</h4>
            </div>
          </div>
        )}
      </div>

      {/* PIN Modal */}
      {showPinModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ background: "#fff", padding: "24px", borderRadius: "8px", width: "300px" }}>
            <h3>Ange PIN-kod</h3>
            <form onSubmit={handlePinSubmit}>
              <input
                type="password"
                placeholder="PIN-kod (t.ex. 1234)"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                style={{ width: "100%", padding: "8px", margin: "10px 0", boxSizing: "border-box" }}
                autoFocus
              />
              {pinError && <p style={{ color: "red", fontSize: "14px" }}>Fel PIN-kod!</p>}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "12px" }}>
                <button type="button" onClick={() => setShowPinModal(false)} style={{ padding: "6px 12px" }}>
                  Avbryt
                </button>
                <button type="submit" style={{ padding: "6px 12px", background: "#3182ce", color: "#fff", border: "none" }}>
                  Lås upp
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Panel */}
      {isAdmin && (
        <div style={{ background: "#f7fafc", border: "2px dashed #3182ce", padding: "20px", borderRadius: "8px", marginBottom: "30px" }}>
          <div style={{ display: "flex", gap: "10px", marginBottom: "15px" }}>
            <button
              onClick={() => setImportTab("single")}
              style={{
                padding: "8px 14px",
                background: importTab === "single" ? "#3182ce" : "#e2e8f0",
                color: importTab === "single" ? "#fff" : "#000",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              ➕ Lägg till enstaka
            </button>
            <button
              onClick={() => setImportTab("batch")}
              style={{
                padding: "8px 14px",
                background: importTab === "batch" ? "#3182ce" : "#e2e8f0",
                color: importTab === "batch" ? "#fff" : "#000",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              📋 Massimport från Excel
            </button>
          </div>

          {importTab === "single" && (
            <form onSubmit={handleAddItem} style={{ display: "grid", gap: "10px", gridTemplateColumns: "1fr 1fr" }}>
              <input
                type="text"
                placeholder="Gammalt EAN *"
                value={oldEan}
                onChange={(e) => setOldEan(e.target.value)}
                required
                style={{ padding: "8px" }}
              />
              <input
                type="text"
                placeholder="Nytt EAN *"
                value={newEan}
                onChange={(e) => setNewEan(e.target.value)}
                required
                style={{ padding: "8px" }}
              />
              
              <div style={{ gridColumn: "span 2", display: "flex", gap: "8px", alignItems: "center" }}>
                <input
                  type="text"
                  placeholder="Produktnamn (valfritt eller hämta från Bauhaus)"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  style={{ flex: 1, padding: "8px" }}
                />
                <button
                  type="button"
                  onClick={() => lookupBauhaus(oldEan || newEan)}
                  disabled={isLookingUp}
                  style={{
                    padding: "8px 12px",
                    background: "#dd6b20",
                    color: "#fff",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "13px",
                    whiteSpace: "nowrap",
                  }}
                >
                  {isLookingUp ? "Söker..." : "🔍 Hämta från Bauhaus"}
                </button>
              </div>

              {lookupMsg && (
                <p style={{ gridColumn: "span 2", margin: "0", fontSize: "13px", color: lookupMsg.includes("Hittades") ? "green" : "#c53030" }}>
                  {lookupMsg}
                </p>
              )}

              <input
                type="text"
                placeholder="Leverantör (valfritt)"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                style={{ gridColumn: "span 2", padding: "8px" }}
              />
              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  gridColumn: "span 2",
                  padding: "10px",
                  background: "#38a169",
                  color: "#fff",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontWeight: "bold",
                }}
              >
                {isSubmitting ? "Sparar..." : "Spara ersättning"}
              </button>
            </form>
          )}

          {importTab === "batch" && (
            <form onSubmit={handleBatchImport} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <p style={{ margin: "0 0 5px 0", fontSize: "14px", color: "#4a5568" }}>
                Klistra in kolumner från Excel (eller skriv rad för rad med formatet: <strong>GammaltEAN [TAB/Semikolon/Komma] NyttEAN [TAB/Semikolon/Komma] Produktnamn</strong>):
              </p>
              <textarea
                rows={8}
                placeholder={"Exempel:\n7312345678901\t7398765432109\tSkruv M6\n7311111111111\t7322222222222\tPlugg 8mm"}
                value={batchText}
                onChange={(e) => setBatchText(e.target.value)}
                required
                style={{ width: "100%", padding: "8px", fontFamily: "monospace", boxSizing: "border-box" }}
              />
              <input
                type="text"
                placeholder="Gemensam leverantör för alla rader (valfritt)"
                value={batchSupplier}
                onChange={(e) => setBatchSupplier(e.target.value)}
                style={{ padding: "8px" }}
              />
              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  padding: "10px",
                  background: "#38a169",
                  color: "#fff",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontWeight: "bold",
                }}
              >
                {isSubmitting ? "Importerar..." : "Starta massimport"}
              </button>
              {batchStatus && (
                <p style={{ marginTop: "8px", fontWeight: "bold", color: batchStatus.includes("Framgång") ? "green" : "#d69e2e" }}>
                  {batchStatus}
                </p>
              )}
            </form>
          )}
        </div>
      )}

      {/* Sök och filter i Sparade EAN */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
        <input
          type="text"
          placeholder="Sök på sparat EAN, produkt eller leverantör..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ flex: 1, padding: "10px", borderRadius: "6px", border: "1px solid #ccc" }}
        />
        <select
          value={selectedSupplier}
          onChange={(e) => setSelectedSupplier(e.target.value)}
          style={{ padding: "10px", borderRadius: "6px", border: "1px solid #ccc" }}
        >
          {suppliers.map((sup) => (
            <option key={sup} value={sup}>
              {sup}
            </option>
          ))}
        </select>
      </div>

      {/* Lista / Tabell över EAN-koder */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #e2e8f0" }}>
          <thead>
            <tr style={{ background: "#edf2f7", textAlign: "left" }}>
              <th style={{ padding: "12px", border: "1px solid #e2e8f0" }}>Produktnamn</th>
              <th style={{ padding: "12px", border: "1px solid #e2e8f0" }}>Gammalt EAN</th>
              <th style={{ padding: "12px", border: "1px solid #e2e8f0" }}>Nytt EAN</th>
              <th style={{ padding: "12px", border: "1px solid #e2e8f0" }}>Leverantör</th>
              {isAdmin && <th style={{ padding: "12px", border: "1px solid #e2e8f0", width: "60px", textAlign: "center" }}>Åtgärd</th>}
            </tr>
          </thead>
          <tbody>
            {filteredItems.length > 0 ? (
              filteredItems.map((item) => (
                <tr key={item.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <td style={{ padding: "12px" }}>
                    {item.productName || "-"}
                  </td>
                  <td style={{ padding: "12px", color: "#e53e3e", fontWeight: "bold" }}>
                    {item.oldEan}
                  </td>
                  <td style={{ padding: "12px", color: "#38a169", fontWeight: "bold" }}>
                    {item.newEan}
                    <a
                      href={`https://www.bauhaus.se/catalogsearch/result/?q=${encodeURIComponent(item.newEan)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Öppna sökning på Bauhaus.se"
                      style={{ marginLeft: "8px", textDecoration: "none", fontSize: "12px" }}
                    >
                      🔗
                    </a>
                  </td>
                  <td style={{ padding: "12px" }}>{item.supplier || "-"}</td>
                  {isAdmin && (
                    <td style={{ padding: "12px", textAlign: "center" }}>
                      <button
                        onClick={() => handleDeleteItem(item.id)}
                        title="Ta bort ersättning"
                        style={{
                          background: "#e53e3e",
                          color: "#fff",
                          border: "none",
                          padding: "6px 10px",
                          borderRadius: "4px",
                          cursor: "pointer",
                          fontSize: "14px",
                        }}
                      >
                        🗑️
                      </button>
                    </td>
                  )}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={isAdmin ? 5 : 4} style={{ padding: "20px", textAlign: "center", color: "#718096" }}>
                  Inga EAN-ersättningar hittades.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

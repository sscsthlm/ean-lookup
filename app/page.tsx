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

  // Admin states
  const [isAdmin, setIsAdmin] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);

  // Formulärstater för enskild manuell inmatning
  const [oldEan, setOldEan] = useState("");
  const [newEan, setNewEan] = useState("");
  const [productName, setProductName] = useState("");
  const [supplier, setSupplier] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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

      // Nollställ formulär
      setOldEan("");
      setNewEan("");
      setProductName("");
      setSupplier("");

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

        // Separera på Tab, semikolon eller kommatecken
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

  // Unika leverantörer för filtrering
  const suppliers = [
    "Alla",
    ...Array.from(new Set(items.map((i) => i.supplier).filter((s): s is string => Boolean(s)))),
  ];

  // Filtrera resultat baserat på sökord och leverantör
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
      {/* Header med Hänglås för Admin */}
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

      {/* PIN Modal */}
      {showPinModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,

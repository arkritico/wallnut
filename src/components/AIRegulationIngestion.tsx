"use client";

/**
 * 🤖 AI-Powered Regulation Ingestion
 *
 * Semi-automatic regulation feeding:
 * 1. User pastes regulation text (DL, Portaria, etc.)
 * 2. AI extracts quantitative rules using extraction prompt
 * 3. System validates, classifies, and detects conflicts
 * 4. User reviews and approves
 * 5. Rules are merged into correct specialty plugin
 */

import { useState, useRef } from "react";
import { Sparkles, FileText, AlertCircle, CheckCircle2, Loader2, ChevronDown, ChevronUp, Upload, File } from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================

interface ExtractedRule {
  id: string;
  artigo: string;
  regulamento: string;
  categoria: string;
  descricao: string;
  contexto?: string; // Human-readable context
  condicoes_aplicacao?: string[]; // Machine-readable conditions when rule applies
  exclusoes?: string[]; // When rule does NOT apply
  parametro: string;
  tipo_validacao: "range" | "threshold" | "formula" | "lookup" | "conditional";
  valores: {
    min?: number;
    max?: number;
    unidade?: string;
    formula?: string;
    tabela?: Record<string, number>;
    condicao?: string;
  };
  ambito: string;
  severidade: "mandatory" | "recommended" | "informative";
}

interface ValidatedRule extends ExtractedRule {
  isValid: boolean;
  validationErrors: string[];
  conflicts: ConflictInfo[];
  suggestedPlugin: string;
  suggestedCategory: string;
  confidence: number;
}

interface ConflictInfo {
  type: "duplicate" | "contradiction" | "overlap";
  existingRuleId: string;
  message: string;
}

interface AIRegulationIngestionProps {
  onRulesExtracted: (rules: ValidatedRule[]) => void;
  existingRules?: ExtractedRule[];
  availablePlugins: string[];
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function AIRegulationIngestion({
  onRulesExtracted,
  existingRules = [],
  availablePlugins = ["plumbing", "electrical", "hvac", "structural"],
}: AIRegulationIngestionProps) {
  const [regulationText, setRegulationText] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isExtractingPDF, setIsExtractingPDF] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedRules, setExtractedRules] = useState<ValidatedRule[]>([]);
  const [expandedRules, setExpandedRules] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ============================================================================
  // PDF TEXT EXTRACTION (Client-Side)
  // ============================================================================

  async function extractTextFromPDF(file: File): Promise<string> {
    try {
      // Dynamic import to avoid SSR issues (PDF.js requires browser APIs)
      const pdfjsLib = await import("pdfjs-dist");

      // Configure worker (use local file instead of CDN to avoid CORS/network issues)
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.js/pdf.worker.min.mjs';

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      let fullText = "";

      // Extract text from each page
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(" ");
        fullText += pageText + "\n\n";
      }

      return fullText.trim();
    } catch (error) {
      console.error("Error extracting PDF text:", error);
      throw new Error("Falha ao extrair texto do PDF. Tente colar o texto manualmente.");
    }
  }

  // ============================================================================
  // EXTRACTION
  // ============================================================================

  async function handleExtractRules() {
    if (!regulationText.trim()) {
      alert("Por favor, faça upload de um PDF ou cole o texto do regulamento.");
      return;
    }

    setIsExtracting(true);

    try {
      // Always send text (PDF text is extracted client-side first)
      const response = await fetch("/api/extract-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: regulationText }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || errorData.message || `Erro ${response.status}: ${response.statusText}`;
        console.error("API Error:", response.status, response.statusText, errorData);
        throw new Error(errorMessage);
      }

      const { rules, metadata } = await response.json();

      // Check if any rules were found
      if (!rules || rules.length === 0) {
        alert(
          `ℹ️ Nenhuma regra quantitativa encontrada.\n\n` +
          `Este documento parece ser procedimental/qualitativo.\n\n` +
          `Procure documentos com:\n` +
          `• Valores numéricos (mínimos, máximos)\n` +
          `• Fórmulas matemáticas\n` +
          `• Tabelas de dimensionamento\n` +
          `• Thresholds (ex: "Se área > 500m²...")`
        );
        setExtractedRules([]);
        return;
      }

      // Validate and classify each rule
      const validated = rules.map((rule: ExtractedRule) =>
        validateAndClassifyRule(rule, existingRules)
      );

      setExtractedRules(validated);
      onRulesExtracted(validated);
    } catch (error: any) {
      console.error("Erro ao extrair regras:", error);
      const errorMessage = error.message || "Erro desconhecido ao extrair regras";
      alert(`❌ Erro na extração:\n\n${errorMessage}\n\nVerifique o console do browser (F12) para mais detalhes.`);
    } finally {
      setIsExtracting(false);
    }
  }

  // ============================================================================
  // VALIDATION & CLASSIFICATION
  // ============================================================================

  function validateAndClassifyRule(
    rule: ExtractedRule,
    existing: ExtractedRule[]
  ): ValidatedRule {
    const errors: string[] = [];

    // Structural validation
    if (!rule.id || !rule.parametro) errors.push("ID ou parâmetro em falta");
    if (!rule.valores || Object.keys(rule.valores).length === 0) {
      errors.push("Valores em falta");
    }

    // Detect conflicts
    const conflicts = detectConflicts(rule, existing);

    // Classify plugin
    const { plugin, category, confidence } = classifyRule(rule);

    return {
      ...rule,
      isValid: errors.length === 0,
      validationErrors: errors,
      conflicts,
      suggestedPlugin: plugin,
      suggestedCategory: category,
      confidence,
    };
  }

  function detectConflicts(
    rule: ExtractedRule,
    existing: ExtractedRule[]
  ): ConflictInfo[] {
    const conflicts: ConflictInfo[] = [];

    for (const existingRule of existing) {
      // Duplicate parameter
      if (existingRule.parametro === rule.parametro &&
          existingRule.ambito === rule.ambito) {
        conflicts.push({
          type: "duplicate",
          existingRuleId: existingRule.id,
          message: `Parâmetro duplicado: ${existingRule.id}`,
        });
      }

      // Contradicting values
      if (existingRule.parametro === rule.parametro) {
        const existingMin = existingRule.valores.min;
        const ruleMin = rule.valores.min;
        if (existingMin && ruleMin && existingMin !== ruleMin) {
          conflicts.push({
            type: "contradiction",
            existingRuleId: existingRule.id,
            message: `Contradição: ${existingRule.id} define min=${existingMin}, esta regra define min=${ruleMin}`,
          });
        }
      }
    }

    return conflicts;
  }

  function classifyRule(rule: ExtractedRule): {
    plugin: string;
    category: string;
    confidence: number;
  } {
    const param = rule.parametro.toLowerCase();
    const desc = rule.descricao.toLowerCase();
    const text = `${param} ${desc} ${rule.categoria}`.toLowerCase();

    // Plumbing keywords
    if (
      /pressao|caudal|diametro.*tubag|agua|drena|hidra|sanita/i.test(text)
    ) {
      return { plugin: "plumbing", category: rule.categoria, confidence: 0.9 };
    }

    // Electrical keywords
    if (
      /corrente|tensao|seccao.*condutor|eletric|potencia|cabo|disjuntor/i.test(text)
    ) {
      return { plugin: "electrical", category: rule.categoria, confidence: 0.9 };
    }

    // HVAC keywords
    if (/temperatura|ventilacao|climatizacao|ar.*condicion/i.test(text)) {
      return { plugin: "hvac", category: rule.categoria, confidence: 0.8 };
    }

    // Structural keywords
    if (/estrutur|resist.*fogo|compartiment|evacua/i.test(text)) {
      return { plugin: "structural", category: rule.categoria, confidence: 0.7 };
    }

    return { plugin: "general", category: rule.categoria, confidence: 0.5 };
  }

  // ============================================================================
  // UI HANDLERS
  // ============================================================================

  function toggleRuleExpanded(ruleId: string) {
    setExpandedRules((prev) => {
      const next = new Set(prev);
      if (next.has(ruleId)) {
        next.delete(ruleId);
      } else {
        next.add(ruleId);
      }
      return next;
    });
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      alert("Por favor, selecione um ficheiro PDF.");
      return;
    }

    setUploadedFile(file);
    setIsExtractingPDF(true);

    try {
      // Extract text from PDF on client-side
      const text = await extractTextFromPDF(file);
      setRegulationText(text);
      console.log(`✅ Extracted ${text.length} characters from PDF`);
    } catch (error: any) {
      console.error("PDF extraction error:", error);
      alert(`❌ Erro ao extrair texto do PDF:\n\n${error.message}\n\nTente colar o texto manualmente.`);
      handleRemoveFile();
    } finally {
      setIsExtractingPDF(false);
    }
  }

  function handleRemoveFile() {
    setUploadedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleImportRules() {
    const validRules = extractedRules.filter((r) => r.isValid);

    if (validRules.length === 0) {
      alert("Nenhuma regra válida para importar.");
      return;
    }

    // Call the callback with valid rules
    onRulesExtracted(validRules);

    // Reset state
    setExtractedRules([]);
    setRegulationText("");
    setUploadedFile(null);

    alert(`✅ ${validRules.length} regra(s) importada(s) com sucesso!`);
  }

  function handleCancel() {
    setExtractedRules([]);
    setRegulationText("");
    setUploadedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="space-y-6">
      {/* Input Section */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Upload className="w-5 h-5 text-accent" />
          <h3 className="text-lg font-semibold">Upload PDF ou Cole Texto</h3>
        </div>

        {/* PDF Upload Area */}
        {!uploadedFile && !regulationText && (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-accent hover:bg-accent-light transition-all cursor-pointer"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={handleFileSelect}
              className="hidden"
            />
            <Upload className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-700 mb-1">
              Clique para fazer upload de PDF
            </p>
            <p className="text-xs text-gray-500">
              ✅ Qualquer tamanho · Extração no browser · ou cole o texto abaixo
            </p>
          </div>
        )}

        {/* Uploaded File Display */}
        {uploadedFile && (
          <div className="border-2 border-accent rounded-lg p-4 bg-accent-light flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-accent-medium flex items-center justify-center">
                {isExtractingPDF ? (
                  <Loader2 className="w-5 h-5 text-accent animate-spin" />
                ) : (
                  <File className="w-5 h-5 text-accent" />
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">{uploadedFile.name}</p>
                <p className="text-xs text-gray-500">
                  {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                  {isExtractingPDF && " • Extraindo texto..."}
                </p>
              </div>
            </div>
            <button
              onClick={handleRemoveFile}
              disabled={isExtractingPDF}
              className="text-sm text-red-600 hover:text-red-800 px-3 py-1 rounded hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Remover
            </button>
          </div>
        )}

        {/* Text Input (Always visible for editing) */}
        {!uploadedFile && (
          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white px-2 text-gray-500">ou cole o texto</span>
            </div>
          </div>
        )}

        {(regulationText || uploadedFile) && (
          <>
            <textarea
              value={regulationText}
              onChange={(e) => setRegulationText(e.target.value)}
              placeholder="DECRETO-LEI N.º 123/2024&#10;&#10;Artigo 1º - ...&#10;Artigo 2º - A pressão mínima nos dispositivos é de 150 kPa..."
              disabled={isExtractingPDF}
              className="w-full h-48 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent focus:border-transparent font-mono text-sm resize-none disabled:bg-gray-50 disabled:cursor-wait"
            />

            {regulationText && !isExtractingPDF && (
              <p className="text-sm text-gray-600 mt-2">
                {regulationText.length.toLocaleString()} caracteres • {regulationText.split(/\n\n+/).length} parágrafos
                {uploadedFile && " • ✅ Texto extraído do PDF (pode editar)"}
              </p>
            )}
          </>
        )}

        <div className="mt-4 flex justify-end">
          <button
            onClick={handleExtractRules}
            disabled={isExtracting || isExtractingPDF || !regulationText.trim()}
            className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-[#4d65ff] to-purple-600 text-white rounded-lg hover:from-[#3a4fdb] hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md"
          >
            {isExtractingPDF ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Extraindo texto do PDF...
              </>
            ) : isExtracting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Analisando com AI...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Extrair Regras com AI
              </>
            )}
          </button>
        </div>
      </div>

      {/* Results Section */}
      {extractedRules.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">
              ✅ {extractedRules.length} Regras Extraídas
            </h3>
            <div className="flex gap-2">
              <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm">
                {extractedRules.filter((r) => r.isValid).length} válidas
              </span>
              {extractedRules.some((r) => r.conflicts.length > 0) && (
                <span className="px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-sm">
                  {extractedRules.filter((r) => r.conflicts.length > 0).length} conflitos
                </span>
              )}
            </div>
          </div>

          <div className="space-y-2">
            {extractedRules.map((rule) => {
              const isExpanded = expandedRules.has(rule.id);

              return (
                <div
                  key={rule.id}
                  className={`border rounded-lg p-4 ${
                    rule.isValid
                      ? "border-green-200 bg-green-50"
                      : "border-red-200 bg-red-50"
                  }`}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {rule.isValid ? (
                          <CheckCircle2 className="w-4 h-4 text-green-600" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-red-600" />
                        )}
                        <span className="font-mono text-xs text-gray-600">
                          {rule.id}
                        </span>
                        <span className="px-2 py-0.5 bg-accent-medium text-accent rounded text-xs">
                          {rule.suggestedPlugin}
                        </span>
                        <span className="text-xs text-gray-500">
                          {(rule.confidence * 100).toFixed(0)}% confiança
                        </span>
                      </div>
                      <p className="text-sm font-medium">{rule.descricao}</p>
                      {rule.contexto && (
                        <div className="mt-2 px-3 py-2 bg-amber-50 border-l-2 border-amber-400 rounded">
                          <p className="text-xs text-amber-900">
                            <span className="font-semibold">⚠️ Contexto: </span>
                            {rule.contexto}
                          </p>
                        </div>
                      )}
                      <p className="text-xs text-gray-600 mt-1">
                        {rule.artigo} • {rule.parametro}
                      </p>
                    </div>

                    <button
                      onClick={() => toggleRuleExpanded(rule.id)}
                      className="p-1 hover:bg-gray-200 rounded"
                    >
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                  </div>

                  {/* Conflicts */}
                  {rule.conflicts.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {rule.conflicts.map((conflict, idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-2 text-xs text-amber-800 bg-amber-100 rounded p-2"
                        >
                          <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                          <span>{conflict.message}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-gray-200 text-xs space-y-2">
                      <div>
                        <span className="font-semibold">Valores: </span>
                        <code className="bg-gray-100 px-2 py-1 rounded">
                          {JSON.stringify(rule.valores)}
                        </code>
                      </div>
                      <div>
                        <span className="font-semibold">Tipo: </span>
                        {rule.tipo_validacao}
                      </div>
                      <div>
                        <span className="font-semibold">Âmbito: </span>
                        {rule.ambito}
                      </div>
                      <div>
                        <span className="font-semibold">Severidade: </span>
                        {rule.severidade}
                      </div>
                      {rule.condicoes_aplicacao && rule.condicoes_aplicacao.length > 0 && (
                        <div className="bg-green-50 p-2 rounded border border-green-200">
                          <span className="font-semibold text-green-800">✓ Aplica-se quando: </span>
                          <ul className="mt-1 ml-4 list-disc text-green-900">
                            {rule.condicoes_aplicacao.map((cond, idx) => (
                              <li key={idx}>{cond}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {rule.exclusoes && rule.exclusoes.length > 0 && (
                        <div className="bg-red-50 p-2 rounded border border-red-200">
                          <span className="font-semibold text-red-800">✗ NÃO aplica-se a: </span>
                          <ul className="mt-1 ml-4 list-disc text-red-900">
                            {rule.exclusoes.map((exc, idx) => (
                              <li key={idx}>{exc}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {!rule.isValid && (
                        <div className="text-red-600">
                          <span className="font-semibold">Erros: </span>
                          {rule.validationErrors.join(", ")}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Actions */}
          <div className="mt-6 flex gap-3">
            <button
              onClick={handleImportRules}
              disabled={extractedRules.filter((r) => r.isValid).length === 0}
              className="flex-1 px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
            >
              📥 Importar Regras Válidas ({extractedRules.filter((r) => r.isValid).length})
            </button>
            <button
              onClick={handleCancel}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              ❌ Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

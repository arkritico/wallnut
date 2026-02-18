// ============================================================
// REGULATION REGISTRY — Lifecycle management for regulations
// ============================================================
//
// Manages the full lifecycle of regulation documents:
// - Adding new regulations
// - Amending existing regulations
// - Superseding (replacing) regulations
// - Revoking regulations
// - Querying only active/current regulations
// - Maintaining an audit trail
//

import type {
  RegulationDocument,
  RegulationStatus,
  DeclarativeRule,
  SpecialtyPlugin,
  RegistryEvent,
  RegistryEventType,
} from "./types";

export class RegulationRegistry {
  private regulations: Map<string, RegulationDocument> = new Map();
  private rules: Map<string, DeclarativeRule[]> = new Map(); // regulationId -> rules
  private events: RegistryEvent[] = [];
  private eventCounter = 0;

  constructor(plugin?: SpecialtyPlugin) {
    if (plugin) {
      this.loadPlugin(plugin);
    }
  }

  // ----------------------------------------------------------
  // Loading
  // ----------------------------------------------------------

  /** Load all regulations and rules from a plugin definition */
  loadPlugin(plugin: SpecialtyPlugin): void {
    for (const reg of plugin.regulations) {
      this.regulations.set(reg.id, { ...reg });
    }
    // Group rules by regulation ID
    for (const rule of plugin.rules) {
      const existing = this.rules.get(rule.regulationId) ?? [];
      existing.push({ ...rule });
      this.rules.set(rule.regulationId, existing);
    }
  }

  // ----------------------------------------------------------
  // Querying
  // ----------------------------------------------------------

  /** Get all regulations with a given status */
  getByStatus(status: RegulationStatus): RegulationDocument[] {
    return Array.from(this.regulations.values()).filter(r => r.status === status);
  }

  /** Get only active regulations (the ones the analyzer should use) */
  getActiveRegulations(): RegulationDocument[] {
    return this.getByStatus("active");
  }

  /** Get active + amended regulations (amended are still partially active) */
  getApplicableRegulations(): RegulationDocument[] {
    return Array.from(this.regulations.values()).filter(
      r => r.status === "active" || r.status === "amended"
    );
  }

  /** Get all rules from active/applicable regulations */
  getActiveRules(): DeclarativeRule[] {
    const applicable = this.getApplicableRegulations();
    const applicableIds = new Set(applicable.map(r => r.id));
    const result: DeclarativeRule[] = [];

    for (const [regId, rules] of this.rules) {
      if (applicableIds.has(regId)) {
        result.push(...rules.filter(r => r.enabled));
      }
    }
    return result;
  }

  /** Get a specific regulation by ID */
  getRegulation(id: string): RegulationDocument | undefined {
    return this.regulations.get(id);
  }

  /** Get rules for a specific regulation */
  getRulesForRegulation(regulationId: string): DeclarativeRule[] {
    return this.rules.get(regulationId) ?? [];
  }

  /** Get all regulations (including superseded/revoked, for reference) */
  getAllRegulations(): RegulationDocument[] {
    return Array.from(this.regulations.values());
  }

  /** Get the full lifecycle chain for a regulation (original -> amendments -> current) */
  getLifecycleChain(regulationId: string): RegulationDocument[] {
    const chain: RegulationDocument[] = [];
    const reg = this.regulations.get(regulationId);
    if (!reg) return chain;

    // Walk backwards through what this amends
    for (const amendsId of reg.amends) {
      const parent = this.regulations.get(amendsId);
      if (parent) chain.push(parent);
    }

    chain.push(reg);

    // Walk forwards through what amends/supersedes this
    for (const amendId of reg.amendedBy) {
      const amendment = this.regulations.get(amendId);
      if (amendment) chain.push(amendment);
    }
    if (reg.supersededBy) {
      const successor = this.regulations.get(reg.supersededBy);
      if (successor) chain.push(successor);
    }

    return chain;
  }

  /** Search regulations by tag */
  searchByTag(tag: string): RegulationDocument[] {
    return Array.from(this.regulations.values()).filter(
      r => r.tags.includes(tag)
    );
  }

  /** Get coverage report: which regulations have complete rules vs pending */
  getCoverageReport(): {
    total: number;
    active: number;
    withRules: number;
    verified: number;
    pending: number;
    coverage: number;
  } {
    const all = Array.from(this.regulations.values());
    const active = all.filter(r => r.status === "active" || r.status === "amended");
    const withRules = active.filter(r => r.ingestionStatus === "complete" || r.ingestionStatus === "verified");
    const verified = active.filter(r => r.ingestionStatus === "verified");
    const pending = active.filter(r => r.ingestionStatus === "pending" || r.ingestionStatus === "partial");

    return {
      total: all.length,
      active: active.length,
      withRules: withRules.length,
      verified: verified.length,
      pending: pending.length,
      coverage: active.length > 0 ? Math.round((withRules.length / active.length) * 100) : 0,
    };
  }

  // ----------------------------------------------------------
  // Lifecycle Operations
  // ----------------------------------------------------------

  /**
   * Register a new regulation document.
   */
  addRegulation(reg: RegulationDocument, actor: string): void {
    if (this.regulations.has(reg.id)) {
      throw new Error(`Regulation ${reg.id} already exists. Use updateRegulation() instead.`);
    }
    this.regulations.set(reg.id, { ...reg });
    this.recordEvent("regulation_added", reg.id, actor,
      `Adicionado regulamento: ${reg.shortRef} — ${reg.title}`);
  }

  /**
   * Register rules extracted from a regulation.
   */
  addRules(regulationId: string, rules: DeclarativeRule[], actor: string): void {
    const reg = this.regulations.get(regulationId);
    if (!reg) throw new Error(`Regulation ${regulationId} not found.`);

    const existing = this.rules.get(regulationId) ?? [];
    existing.push(...rules);
    this.rules.set(regulationId, existing);

    reg.rulesCount = existing.length;
    reg.ingestionStatus = "complete";
    reg.ingestionDate = new Date().toISOString();

    this.recordEvent("rules_extracted", regulationId, actor,
      `Extraídas ${rules.length} regras de ${reg.shortRef}`);
  }

  /**
   * Mark extracted rules as verified by an engineer.
   */
  verifyRules(regulationId: string, verifier: string): void {
    const reg = this.regulations.get(regulationId);
    if (!reg) throw new Error(`Regulation ${regulationId} not found.`);

    reg.ingestionStatus = "verified";
    reg.verifiedBy = verifier;

    this.recordEvent("rules_verified", regulationId, verifier,
      `Regras de ${reg.shortRef} verificadas por ${verifier}`);
  }

  /**
   * Amend a regulation: the original stays partially active,
   * but specific sections are overridden by the amendment.
   *
   * Example: Portaria 252/2015 amends Portaria 949-A/2006
   * - The original RTIEBT stays "amended" (still mostly in force)
   * - The amendment is "active" (its new sections take priority)
   */
  amendRegulation(
    originalId: string,
    amendment: RegulationDocument,
    actor: string
  ): void {
    const original = this.regulations.get(originalId);
    if (!original) throw new Error(`Regulation ${originalId} not found.`);

    // Mark original as amended
    original.status = "amended";
    original.amendedBy.push(amendment.id);

    // Register amendment with link to what it amends
    amendment.amends = [originalId];
    amendment.status = "active";
    this.regulations.set(amendment.id, { ...amendment });

    this.recordEvent("regulation_amended", originalId, actor,
      `${original.shortRef} alterado por ${amendment.shortRef}`);
    this.recordEvent("regulation_added", amendment.id, actor,
      `Adicionada alteração: ${amendment.shortRef}`);
  }

  /**
   * Supersede a regulation: the old one is fully replaced.
   *
   * Example: A hypothetical new DL replaces DL 96/2017
   * - Old regulation status -> "superseded"
   * - Old rules are deactivated automatically
   * - New regulation is "active" with its own rules
   */
  supersedeRegulation(
    oldId: string,
    newRegulation: RegulationDocument,
    actor: string
  ): void {
    const old = this.regulations.get(oldId);
    if (!old) throw new Error(`Regulation ${oldId} not found.`);

    const previousState = { ...old };

    // Mark old as superseded
    old.status = "superseded";
    old.supersededBy = newRegulation.id;
    old.revocationDate = newRegulation.effectiveDate;

    // Register new regulation
    newRegulation.status = "active";
    this.regulations.set(newRegulation.id, { ...newRegulation });

    this.recordEvent("regulation_superseded", oldId, actor,
      `${old.shortRef} substituído por ${newRegulation.shortRef}`);
    this.recordEvent("regulation_added", newRegulation.id, actor,
      `Adicionado novo regulamento: ${newRegulation.shortRef}`);
  }

  /**
   * Revoke a regulation outright (no replacement).
   */
  revokeRegulation(regulationId: string, revocationDate: string, actor: string): void {
    const reg = this.regulations.get(regulationId);
    if (!reg) throw new Error(`Regulation ${regulationId} not found.`);

    reg.status = "revoked";
    reg.revocationDate = revocationDate;

    this.recordEvent("regulation_revoked", regulationId, actor,
      `${reg.shortRef} revogado em ${revocationDate}`);
  }

  // ----------------------------------------------------------
  // Audit Trail
  // ----------------------------------------------------------

  private recordEvent(
    type: RegistryEventType,
    regulationId: string,
    actor: string,
    description: string,
    previousState?: Partial<RegulationDocument>
  ): void {
    this.events.push({
      id: `EVT-${++this.eventCounter}`,
      type,
      regulationId,
      timestamp: new Date().toISOString(),
      description,
      actor,
      previousState,
    });
  }

  /** Get the audit trail for a specific regulation */
  getHistory(regulationId: string): RegistryEvent[] {
    return this.events.filter(e => e.regulationId === regulationId);
  }

  /** Get the full audit trail */
  getFullHistory(): RegistryEvent[] {
    return [...this.events];
  }

  // ----------------------------------------------------------
  // Serialization (for persistence)
  // ----------------------------------------------------------

  /** Export registry state to a plain object for JSON serialization */
  export(): { regulations: RegulationDocument[]; rules: DeclarativeRule[]; events: RegistryEvent[] } {
    const allRules: DeclarativeRule[] = [];
    for (const rules of this.rules.values()) {
      allRules.push(...rules);
    }
    return {
      regulations: Array.from(this.regulations.values()),
      rules: allRules,
      events: this.events,
    };
  }

  /** Import registry state from a plain object */
  import(data: { regulations: RegulationDocument[]; rules: DeclarativeRule[]; events?: RegistryEvent[] }): void {
    this.regulations.clear();
    this.rules.clear();

    for (const reg of data.regulations) {
      this.regulations.set(reg.id, reg);
    }
    for (const rule of data.rules) {
      const existing = this.rules.get(rule.regulationId) ?? [];
      existing.push(rule);
      this.rules.set(rule.regulationId, existing);
    }
    if (data.events) {
      this.events = [...data.events];
      this.eventCounter = data.events.length;
    }
  }
}

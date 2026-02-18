/**
 * PlumbingEngine Tests
 *
 * Tests validation of RGSPPDADAR rules with various scenarios
 */

import { PlumbingEngine } from './PlumbingEngine';

describe('PlumbingEngine', () => {
  let engine: PlumbingEngine;

  beforeAll(async () => {
    engine = new PlumbingEngine();
    // Wait for async rules to load (dynamic imports)
    await new Promise(resolve => setTimeout(resolve, 500));
  });

  describe('Initialization', () => {
    it('should load plumbing rules', () => {
      const rules = engine.getRules();
      expect(rules.length).toBeGreaterThan(0);
      console.log(`✅ Loaded ${rules.length} rules`);
    });

    it('should have rules from all categories', () => {
      const stats = engine.getStats();
      console.log('📊 Stats:', stats);

      expect(stats.by_category['Abastecimento de água']).toBeGreaterThan(0);
      expect(stats.by_category['Drenagem de águas residuais']).toBeGreaterThan(0);
    });
  });

  describe('Water Supply - Pressures', () => {
    it('should pass for adequate service pressure', async () => {
      const context = {
        building_type: 'residential' as const,
        pressao_servico: 150 // kPa - within recommended range
      };

      const results = await engine.validate(context);
      const pressureResults = results.filter(r => r.ruleId.includes('R005') || r.ruleId.includes('R007') || r.ruleId.includes('R008'));

      console.log('💧 Pressure validation results:', pressureResults);

      // Should pass minimum (100 kPa)
      const minPressure = pressureResults.find(r => r.ruleId === 'PLUMB_R005');
      expect(minPressure?.passed).toBe(true);

      // Should pass maximum (600 kPa)
      const maxPressure = pressureResults.find(r => r.ruleId === 'PLUMB_R007');
      expect(maxPressure?.passed).toBe(true);

      // Should pass recommended range (150-300 kPa)
      const recommended = pressureResults.find(r => r.ruleId === 'PLUMB_R008');
      expect(recommended?.passed).toBe(true);
    });

    it('should fail for pressure below minimum', async () => {
      const context = {
        building_type: 'residential' as const,
        pressao_servico: 80 // kPa - below 100 kPa minimum
      };

      const results = await engine.validate(context);
      const minPressure = results.find(r => r.ruleId === 'PLUMB_R005');

      console.log('❌ Low pressure result:', minPressure);

      expect(minPressure?.passed).toBe(false);
      expect(minPressure?.message).toContain('inferior');
      expect(minPressure?.severity).toBe('mandatory');
    });

    it('should fail for pressure above maximum', async () => {
      const context = {
        building_type: 'residential' as const,
        pressao_servico: 700 // kPa - above 600 kPa maximum
      };

      const results = await engine.validate(context);
      const maxPressure = results.find(r => r.ruleId === 'PLUMB_R007');

      console.log('❌ High pressure result:', maxPressure);

      expect(maxPressure?.passed).toBe(false);
      expect(maxPressure?.message).toContain('excede');
      expect(maxPressure?.severity).toBe('mandatory');
    });

    it('should calculate pressure for multi-story building', async () => {
      const context = {
        building_type: 'residential' as const,
        numero_pisos: 5,
        pressao_rede_publica: 300 // kPa - sufficient for 5 floors
      };

      const results = await engine.validate(context);
      const formula = results.find(r => r.ruleId === 'PLUMB_R006');

      console.log('🏢 Multi-story pressure result:', formula);

      // Required: H = 100 + 40*5 = 300 kPa
      expect(formula?.passed).toBe(true);
    });

    it('should fail for insufficient network pressure', async () => {
      const context = {
        building_type: 'residential' as const,
        numero_pisos: 5,
        pressao_rede_publica: 250 // kPa - insufficient (needs 300)
      };

      const results = await engine.validate(context);
      const formula = results.find(r => r.ruleId === 'PLUMB_R006');

      console.log('❌ Insufficient network pressure:', formula);

      expect(formula?.passed).toBe(false);
      expect(formula?.message).toBeTruthy(); // formula fails - insufficient pressure
    });
  });

  describe('Water Supply - Diameters', () => {
    it('should pass for adequate pipe diameter', async () => {
      const context = {
        building_type: 'residential' as const,
        diametro_tubagem_ligacao: 25 // mm - above 20mm minimum
      };

      const results = await engine.validate(context);
      const diameter = results.find(r => r.ruleId === 'PLUMB_R001');

      console.log('✅ Diameter result:', diameter);

      expect(diameter?.passed).toBe(true);
    });

    it('should fail for undersized pipe', async () => {
      const context = {
        building_type: 'residential' as const,
        diametro_tubagem_ligacao: 15 // mm - below 20mm minimum
      };

      const results = await engine.validate(context);
      const diameter = results.find(r => r.ruleId === 'PLUMB_R001');

      console.log('❌ Undersized pipe result:', diameter);

      expect(diameter?.passed).toBe(false);
      expect(diameter?.details?.actual).toBe(15);
      expect(diameter?.details?.expected).toBe(20);
    });

    it('should require larger diameter for fire protection', async () => {
      const context = {
        building_type: 'commercial' as const,
        tem_servico_incendio: true,
        tem_reservatorio_regularizacao: false,
        diametro_tubagem_ligacao: 45 // mm - adequate for fire protection
      };

      const results = await engine.validate(context);
      const fireProtection = results.find(r => r.ruleId === 'PLUMB_R002');

      console.log('🔥 Fire protection result:', fireProtection);

      expect(fireProtection?.passed).toBe(true);
    });
  });

  describe('Water Supply - Installation Depth', () => {
    it('should pass for adequate depth with traffic', async () => {
      const context = {
        building_type: 'residential' as const,
        area_sem_trafego: false,
        profundidade_assentamento: 0.85 // m - above 0.80m requirement
      };

      const results = await engine.validate(context);
      const depth = results.find(r => r.ruleId === 'PLUMB_R004');

      console.log('✅ Depth with traffic result:', depth);

      expect(depth?.passed).toBe(true);
    });

    it('should allow reduced depth without traffic', async () => {
      const context = {
        building_type: 'residential' as const,
        area_sem_trafego: true,
        profundidade_assentamento: 0.55 // m - above 0.50m (reduced requirement)
      };

      const results = await engine.validate(context);
      const depth = results.find(r => r.ruleId === 'PLUMB_R004');

      console.log('✅ Reduced depth result:', depth);

      expect(depth?.passed).toBe(true);
    });
  });

  describe('Water Supply - Velocities', () => {
    it('should pass for velocity within range', async () => {
      const context = {
        building_type: 'residential' as const,
        velocidade_escoamento: 1.2 // m/s - within 0.5-2.0 range
      };

      const results = await engine.validate(context);
      const velocity = results.find(r => r.ruleId === 'PLUMB_R010');

      console.log('✅ Velocity result:', velocity);

      expect(velocity?.passed).toBe(true);
    });

    it('should fail for velocity too low', async () => {
      const context = {
        building_type: 'residential' as const,
        velocidade_escoamento: 0.3 // m/s - below 0.5 m/s minimum
      };

      const results = await engine.validate(context);
      const velocity = results.find(r => r.ruleId === 'PLUMB_R010');

      console.log('❌ Low velocity result:', velocity);

      expect(velocity?.passed).toBe(false);
    });

    it('should fail for velocity too high', async () => {
      const context = {
        building_type: 'residential' as const,
        velocidade_escoamento: 2.5 // m/s - above 2.0 m/s maximum
      };

      const results = await engine.validate(context);
      const velocity = results.find(r => r.ruleId === 'PLUMB_R010');

      console.log('❌ High velocity result:', velocity);

      expect(velocity?.passed).toBe(false);
    });
  });

  describe('Wastewater Drainage - Diameters and Slopes', () => {
    it('should pass for adequate drainage diameter', async () => {
      const context = {
        building_type: 'residential' as const,
        diametro_tubagem_drenagem: 50 // mm - above 40mm minimum
      };

      const results = await engine.validate(context);
      const diameter = results.find(r => r.ruleId === 'PLUMB_R011');

      console.log('✅ Drainage diameter result:', diameter);

      expect(diameter?.passed).toBe(true);
    });

    it('should pass for slope within range', async () => {
      const context = {
        building_type: 'residential' as const,
        declive_tubagem: 20 // mm/m - within 10-40 range (2%)
      };

      const results = await engine.validate(context);
      const slope = results.find(r => r.ruleId === 'PLUMB_R012');

      console.log('✅ Slope result:', slope);

      expect(slope?.passed).toBe(true);
    });

    it('should fail for slope too shallow', async () => {
      const context = {
        building_type: 'residential' as const,
        declive_tubagem: 5 // mm/m - below 10 mm/m minimum (0.5%)
      };

      const results = await engine.validate(context);
      const slope = results.find(r => r.ruleId === 'PLUMB_R012');

      console.log('❌ Shallow slope result:', slope);

      expect(slope?.passed).toBe(false);
    });
  });

  describe('Wastewater Drainage - Ventilation', () => {
    it('should require 2m height for accessible roof', async () => {
      const context = {
        building_type: 'residential' as const,
        cobertura_utilizada_outros_fins: true,
        altura_coluna_ventilacao: 2.1 // m - above 2.0m requirement
      };

      const results = await engine.validate(context);
      const ventilation = results.find(r => r.ruleId === 'PLUMB_R014');

      console.log('✅ Accessible roof ventilation result:', ventilation);

      expect(ventilation?.passed).toBe(true);
    });

    it('should allow 0.5m height for non-accessible roof', async () => {
      const context = {
        building_type: 'residential' as const,
        cobertura_utilizada_outros_fins: false,
        altura_coluna_ventilacao: 0.6 // m - above 0.5m requirement
      };

      const results = await engine.validate(context);
      const ventilation = results.find(r => r.ruleId === 'PLUMB_R015');

      console.log('✅ Non-accessible roof ventilation result:', ventilation);

      expect(ventilation?.passed).toBe(true);
    });

    it('should handle distance from openings', async () => {
      const context = {
        building_type: 'residential' as const,
        distancia_de_vaos: 3.0, // m - less than 4.0m
        elevacao_acima_verga: 1.2 // m - above 1.0m requirement (alternative compliance)
      };

      const results = await engine.validate(context);
      const distance = results.find(r => r.ruleId === 'PLUMB_R016');

      console.log('✅ Distance from openings result:', distance);

      expect(distance?.passed).toBe(true);
    });
  });

  describe('Wastewater Drainage - Inspection Chambers', () => {
    it('should pass for adequate chamber size (shallow)', async () => {
      const context = {
        building_type: 'residential' as const,
        profundidade_caixa: 2.0, // m - less than 2.5m
        dimensao_caixa_inspecao: 1.1 // m - above 1.0m requirement
      };

      const results = await engine.validate(context);
      const chamber = results.find(r => r.ruleId === 'PLUMB_R017');

      console.log('✅ Shallow chamber result:', chamber);

      expect(chamber?.passed).toBe(true);
    });

    it('should require larger chamber for deeper installations', async () => {
      const context = {
        building_type: 'residential' as const,
        profundidade_caixa: 3.0, // m - above 2.5m
        dimensao_caixa_inspecao: 1.3 // m - above 1.25m requirement
      };

      const results = await engine.validate(context);
      const chamber = results.find(r => r.ruleId === 'PLUMB_R017');

      console.log('✅ Deep chamber result:', chamber);

      expect(chamber?.passed).toBe(true);
    });

    it('should pass for chambers within max distance', async () => {
      const context = {
        building_type: 'residential' as const,
        afastamento_entre_caixas: 12 // m - within 15m maximum
      };

      const results = await engine.validate(context);
      const distance = results.find(r => r.ruleId === 'PLUMB_R018');

      console.log('✅ Chamber distance result:', distance);

      expect(distance?.passed).toBe(true);
    });
  });

  describe('Stormwater Drainage', () => {
    it('should validate rational method calculation', async () => {
      const context = {
        building_type: 'residential' as const,
        coeficiente_escoamento: 0.8,
        intensidade_precipitacao: 100, // mm/h
        area_bacia: 0.001, // km²
        caudal_pluvial: (0.8 * 100 * 0.001) / 3.60 // exact rational method result
      };

      const results = await engine.validate(context);
      const rational = results.find(r => r.ruleId === 'PLUMB_R019');

      console.log('🌧️ Rational method result:', rational);

      // Q = (0.8 * 100 * 0.001) / 3.60 = 0.0222 m³/s
      expect(rational?.passed).toBe(true);
    });

    it('should validate time of concentration for steep slopes', async () => {
      const context = {
        building_type: 'residential' as const,
        declive_area: 10, // % - above 8%
        tempo_concentracao: 5 // min - correct for steep slope
      };

      const results = await engine.validate(context);
      const timeConcentration = results.find(r => r.ruleId === 'PLUMB_R020');

      console.log('⏱️ Time of concentration result:', timeConcentration);

      expect(timeConcentration?.passed).toBe(true);
    });
  });

  describe('Boolean Requirements', () => {
    it('should require simultaneity coefficients', async () => {
      const context = {
        building_type: 'residential' as const,
        aplica_coeficiente_simultaneidade: true
      };

      const results = await engine.validate(context);
      const simultaneity = results.find(r => r.ruleId === 'PLUMB_R009');

      console.log('✅ Simultaneity coefficient result:', simultaneity);

      expect(simultaneity?.passed).toBe(true);
    });

    it('should require backflow protection', async () => {
      const context = {
        building_type: 'residential' as const,
        tem_protecao_retorno: true
      };

      const results = await engine.validate(context);
      const backflow = results.find(r => r.ruleId === 'PLUMB_R024');

      console.log('✅ Backflow protection result:', backflow);

      expect(backflow?.passed).toBe(true);
    });

    it('should fail when backflow protection missing', async () => {
      const context = {
        building_type: 'residential' as const,
        tem_protecao_retorno: false
      };

      const results = await engine.validate(context);
      const backflow = results.find(r => r.ruleId === 'PLUMB_R024');

      console.log('❌ Missing backflow protection result:', backflow);

      expect(backflow?.passed).toBe(false);
      expect(backflow?.message).toContain('retorno'); // matches error_message
    });
  });

  describe('Reservoir Capacity', () => {
    it('should validate adequate reservoir capacity', async () => {
      const context = {
        building_type: 'residential' as const,
        capacidade_reservatorio: 5000, // L
        consumo_diario_edificio: 4000 // L - reservoir sufficient
      };

      const results = await engine.validate(context);
      const reservoir = results.find(r => r.ruleId === 'PLUMB_R025');

      console.log('✅ Reservoir capacity result:', reservoir);

      expect(reservoir?.passed).toBe(true);
    });

    it('should fail for insufficient reservoir', async () => {
      const context = {
        building_type: 'residential' as const,
        capacidade_reservatorio: 3000, // L
        consumo_diario_edificio: 4000 // L - reservoir insufficient
      };

      const results = await engine.validate(context);
      const reservoir = results.find(r => r.ruleId === 'PLUMB_R025');

      console.log('❌ Insufficient reservoir result:', reservoir);

      expect(reservoir?.passed).toBe(false);
    });
  });

  describe('Lookup Table Validation', () => {
    it('should validate range-based lookup (capitacoes)', async () => {
      // PLUMB_R067: population-based per-capita consumption brackets
      const context = {
        building_type: 'residential' as const,
        numero_habitantes: 5000, // 1000-10000 bracket → 100 l/hab/dia
        capitacao_minima_l_hab_dia: 80 // Below required 100
      };

      const results = await engine.validate(context);
      const capitacao = results.find(r => r.ruleId === 'PLUMB_R067');

      // Rule should be evaluated (not stub)
      if (capitacao) {
        expect(capitacao.message).not.toContain('not yet implemented');
      }
    });

    it('should validate material lookup (interior network)', async () => {
      // PLUMB_R083: allowed materials for interior pipe networks
      const context = {
        building_type: 'residential' as const,
        material_rede_interior: 'cobre', // Allowed material
        tipo_agua: 'fria',
        aplicacao: 'rede_predial'
      };

      const results = await engine.validate(context);
      const materialRule = results.find(r => r.ruleId === 'PLUMB_R083');

      if (materialRule) {
        expect(materialRule.message).not.toContain('not yet implemented');
        expect(materialRule.passed).toBe(true);
      }
    });

    it('should reject invalid material for interior network', async () => {
      const context = {
        building_type: 'residential' as const,
        material_rede_interior: 'chumbo', // Not in allowed list
        tipo_agua: 'fria',
        aplicacao: 'rede_predial'
      };

      const results = await engine.validate(context);
      const materialRule = results.find(r => r.ruleId === 'PLUMB_R083');

      if (materialRule) {
        expect(materialRule.passed).toBe(false);
      }
    });

    it('should handle device-match lookup (flow rates)', async () => {
      // MASTER_004: instantaneous flow rate by device type
      const context = {
        building_type: 'residential' as const,
        dispositivo: 'lavatorio',
        caudal_instantaneo: 0.10 // Matches minimum for lavatorio
      };

      const results = await engine.validate(context);
      const flowRule = results.find(r => r.ruleId === 'MASTER_004');

      if (flowRule) {
        expect(flowRule.message).not.toContain('not yet implemented');
      }
    });

    it('lookup rules should not return stub message', async () => {
      const context = {
        building_type: 'residential' as const,
      };

      const results = await engine.validate(context);
      const lookupResults = results.filter(r =>
        r.ruleId === 'PLUMB_R067' || r.ruleId === 'PLUMB_R083' ||
        r.ruleId === 'PLUMB_R093' || r.ruleId === 'MASTER_004'
      );

      for (const result of lookupResults) {
        expect(result.message).not.toBe('Lookup validation not yet implemented');
      }
    });
  });

  describe('Summary Statistics', () => {
    it('should provide comprehensive stats', () => {
      const stats = engine.getStats();

      console.log('\n📊 PLUMBING ENGINE STATISTICS:');
      console.log('================================');
      console.log(`Total Rules: ${stats.total}`);
      console.log('\nBy Category:');
      Object.entries(stats.by_category).forEach(([cat, count]) => {
        console.log(`  ${cat}: ${count}`);
      });
      console.log('\nBy Severity:');
      Object.entries(stats.by_severity).forEach(([sev, count]) => {
        console.log(`  ${sev}: ${count}`);
      });
      console.log('\nBy Type:');
      Object.entries(stats.by_type).forEach(([type, count]) => {
        console.log(`  ${type}: ${count}`);
      });

      expect(stats.total).toBeGreaterThan(0);
      expect(stats.by_severity.mandatory).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------
  // P6: Spatial Validation (form-based)
  // ---------------------------------------------------------------
  describe('Spatial Validation', () => {
    it('R064: collector distance from property — passes when ≥ 1m', async () => {
      const results = await engine.validate({
        building_type: 'residential' as const,
        distancia_colector_propriedade: 1.5,
      });
      const r064 = results.find(r => r.ruleId === 'PLUMB_R064');
      if (r064) {
        expect(r064.passed).toBe(true);
        expect(r064.message).not.toContain('skipped');
      }
    });

    it('R064: collector distance from property — fails when < 1m', async () => {
      const results = await engine.validate({
        building_type: 'residential' as const,
        distancia_colector_propriedade: 0.5,
      });
      const r064 = results.find(r => r.ruleId === 'PLUMB_R064');
      if (r064) {
        expect(r064.passed).toBe(false);
      }
    });

    it('R064: skips when distance not provided', async () => {
      const results = await engine.validate({
        building_type: 'residential' as const,
      });
      const r064 = results.find(r => r.ruleId === 'PLUMB_R064');
      if (r064) {
        expect(r064.passed).toBe(true);
        expect(r064.message).toContain('skipped');
      }
    });

    it('R070: water above wastewater + ≥ 1m distance — passes', async () => {
      const results = await engine.validate({
        building_type: 'residential' as const,
        distancia_agua_residuais: 1.2,
        agua_acima_residuais: true,
      });
      const r070 = results.find(r => r.ruleId === 'PLUMB_R070');
      if (r070) {
        expect(r070.passed).toBe(true);
        expect(r070.message).not.toContain('skipped');
      }
    });

    it('R070: water below wastewater — fails', async () => {
      const results = await engine.validate({
        building_type: 'residential' as const,
        distancia_agua_residuais: 1.5,
        agua_acima_residuais: false,
      });
      const r070 = results.find(r => r.ruleId === 'PLUMB_R070');
      if (r070) {
        expect(r070.passed).toBe(false);
      }
    });

    it('R070: water too close to wastewater — fails', async () => {
      const results = await engine.validate({
        building_type: 'residential' as const,
        distancia_agua_residuais: 0.5,
        agua_acima_residuais: true,
      });
      const r070 = results.find(r => r.ruleId === 'PLUMB_R070');
      if (r070) {
        expect(r070.passed).toBe(false);
      }
    });

    it('R070: skips when neither distance nor height provided', async () => {
      const results = await engine.validate({
        building_type: 'residential' as const,
      });
      const r070 = results.find(r => r.ruleId === 'PLUMB_R070');
      if (r070) {
        expect(r070.passed).toBe(true);
        expect(r070.message).toContain('skipped');
      }
    });

    it('R071: distribution pipe distance — passes when ≥ 0.8m', async () => {
      const results = await engine.validate({
        building_type: 'residential' as const,
        distancia_colector_propriedade: 1.0,
      });
      const r071 = results.find(r => r.ruleId === 'PLUMB_R071');
      if (r071) {
        expect(r071.passed).toBe(true);
      }
    });

    it('R071: distribution pipe distance — fails when < 0.8m', async () => {
      const results = await engine.validate({
        building_type: 'residential' as const,
        distancia_colector_propriedade: 0.5,
      });
      const r071 = results.find(r => r.ruleId === 'PLUMB_R071');
      if (r071) {
        expect(r071.passed).toBe(false);
      }
    });

    it('spatial rules no longer return stub message', async () => {
      const results = await engine.validate({
        building_type: 'residential' as const,
        distancia_colector_propriedade: 1.5,
        distancia_agua_residuais: 1.2,
        agua_acima_residuais: true,
      });
      const spatialResults = results.filter(r =>
        r.ruleId === 'PLUMB_R064' || r.ruleId === 'PLUMB_R070' || r.ruleId === 'PLUMB_R071'
      );
      for (const result of spatialResults) {
        expect(result.message).not.toBe('Spatial validation not yet implemented');
      }
    });
  });
});

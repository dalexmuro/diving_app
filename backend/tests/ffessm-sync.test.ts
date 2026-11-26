import { describe, expect, it } from 'vitest';
import { isAllowedFfessmUrl, parseFfessmInfoHtml } from '../src/services/ffessmSync';

const SAMPLE_HTML = `
<div class="card border-primary h-100">
  <div class="card-header bg-primary text-white">Information sur le plongeur</div>
  <div class="card-body">
    <p>Mr ALEX SAMPLE DIVER</p>
    <p>Né(e) le 14/07/1990</p>
  </div>
</div>
<div class="card border-primary h-100">
  <div class="card-header bg-primary text-white">Information sur la licence</div>
  <div class="card-body">
    <p class="font-weight-bold">Licence N°</p>
    <p>A-25-0000001</p>
    <p class="font-weight-bold">Type de licence</p>
    <p>Pratiquant</p>
    <p class="font-weight-bold">Date de souscription</p>
    <p>01/10/2025</p>
    <p class="font-weight-bold">Date de validité</p>
    <p>31/12/2026</p>
    <p class="font-weight-bold">Structure de plongée</p>
    <p>CLUB EXEMPLE PLONGEE (01020304)</p>
  </div>
</div>
<div class="card border-primary h-100">
  <div class="card-header bg-primary text-white">Information sur l'assurance</div>
  <div class="card-body">
    <p class="font-weight-bold">Assurance</p>
    <p>AIA : Loisir 2 2026</p>
    <p class="font-weight-bold">Date de validité</p>
    <p>31/12/2026</p>
  </div>
</div>
<div class="card border-primary h-100">
  <div class="card-header bg-primary text-white">Information sur le certificat medical</div>
  <div class="card-body d-flex flex-column">
    <p class="font-weight-bold">Certificat d'absence de contre-indications valide jusqu'au 31/12/2026</p>
  </div>
</div>
<div class="card border-primary mt-2 mt-md-0">
  <div class="card-header bg-primary text-white">Information sur les brevets</div>
  <div class="card-body">
    <p class="font-weight-bold">Niveau 2</p>
    <p class="font-italic">Délivré à Hy&#xE8;res le 06/06/2026</p>
    <p class="font-weight-bold">Niveau 1</p>
    <p class="font-italic">Délivré à Marseille le 15/05/2025</p>
  </div>
</div>`;

describe('FFESSM InfoLicencie parser', () => {
  it('validates allowed FFESSM HTTPS URLs only', () => {
    expect(isAllowedFfessmUrl('https://infolicencie.ffessm.fr/Home/InfoLicence?number=1&key=ABC')).toBe(true);
    expect(isAllowedFfessmUrl('http://infolicencie.ffessm.fr/Home/InfoLicence')).toBe(false);
    expect(isAllowedFfessmUrl('https://evil.example.com/Home/InfoLicence')).toBe(false);
  });

  it('extracts diver, license, insurance, medical status, and brevets with decoded entities', () => {
    const parsed = parseFfessmInfoHtml(SAMPLE_HTML);
    expect(parsed.fullName).toBe('ALEX SAMPLE DIVER');
    expect(parsed.birthDate).toBe('1990-07-14');
    expect(parsed.licenseNumber).toBe('A-25-0000001');
    expect(parsed.licenseCategory).toBe('Pratiquant');
    expect(parsed.validFrom).toBe('2025-10-01');
    expect(parsed.validUntil).toBe('2026-12-31');
    expect(parsed.clubName).toBe('CLUB EXEMPLE PLONGEE');
    expect(parsed.clubNumber).toBe('01020304');
    expect(parsed.insurance).toBe('AIA : Loisir 2 2026');
    expect(parsed.insuranceValidUntil).toBe('2026-12-31');
    expect(parsed.medicalCertStatus).toContain('valide');
    expect(parsed.brevets).toEqual([
      { level: 'Niveau 2', location: 'Hyères', issuedDate: '2026-06-06' },
      { level: 'Niveau 1', location: 'Marseille', issuedDate: '2025-05-15' },
    ]);
  });
});

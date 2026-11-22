// Training — alle programma's. Een programma toevoegen = een map in sports/ met een PROGRAM-object en hier één regel.
//   kind 'lessons'  genummerde lessen in vaste volgorde (Pilates 30)
//   kind 'circuit'  steeds dezelfde training op vaste dagen (Bio-circuit)
import { PROGRAM as PILATES } from './sports/pilates/index.js';
import { PROGRAM as BIOCIRCUIT } from './sports/biocircuit/index.js';

export const PROGRAMS = [PILATES, BIOCIRCUIT];
export const programById = id => PROGRAMS.find(p => p.id === id) || null;

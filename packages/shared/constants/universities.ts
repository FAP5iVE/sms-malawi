/**
 * [CHANGE TYPE]: MAJOR REWRITE (populating R16's reserved shape)
 * [FILE]: packages/shared/constants/universities.ts
 * [R-PHASE]: R18 — University Placement Module (Phase 11 Blueprint)
 * [PURPOSE]: The University Programmes Registry (Feature A). R16 reserved the
 *   University / UniversityProgram interfaces and an empty UNIVERSITIES array
 *   and explicitly deferred the real data, the structured entry-requirement
 *   shape, MSCE_CREDIT_MAX_GRADE, and the lookup helpers to R18. This file
 *   delivers all of them.
 *
 *   The catalogue is a typed, git-versioned constants file — deliberately NOT
 *   a database table with CRUD/admin/sync (phase11 §0.5.1). Every real
 *   Malawi public-university UNDERGRADUATE programme whose entry route is
 *   plain MSCE/GCE (the school-leaver route) is included, drawn from the eight
 *   uploaded requirement documents (MUST, MUBAS, UNIMA, MZUNI, LUANAR, KUHeS,
 *   DCE, MCHS). Deliberately EXCLUDED per the R18 brief:
 *     • Postgraduate programmes (Master/PhD/PG-Diploma).
 *     • Mature-entry-only programmes (admitting solely via a prior
 *       Diploma/Degree + work experience, e.g. every KUHeS "enters at Year 3"
 *       nursing/clinical track and the Health Management/Midwifery upgrading
 *       programmes).
 *     • Any single programme requiring more than MSCE/GCE for entry — a
 *       prerequisite Diploma/Degree, an A-Level-only route, or a selection
 *       assessment (e.g. UNIMA Law) — even where a school-leaver could
 *       theoretically qualify later; the module matches against MSCE data only.
 *     • Diploma / Certificate awards (undergraduate DEGREE scope only).
 *   MCHS does not publish per-programme subject combinations publicly, so its
 *   degree programmes carry only its published General Entry Requirement
 *   (6 credits including English) — a faithful transcription of what is
 *   publishable (phase11's "transcribe the source faithfully" principle).
 *
 *   Structured entryRequirements power Feature C's eligibility matching;
 *   minimumRequirements is retained as the human-readable display list. Where
 *   a source lists "Physical Science" or "General Science" (older combined-
 *   award subjects since split into Physics + Chemistry, phase11 §2.5), those
 *   strings are transcribed faithfully as alternatives even though no current
 *   student's ManebRecord will carry them — eligibility stays reachable via
 *   the separate Physics/Chemistry entries beside them.
 *
 *   MSCE_CREDIT_MAX_GRADE answers "which MANEB-issued grade digit counts as a
 *   credit" (1–6 on the MSCE 1–9 scale) — a separate, independent constant,
 *   deliberately NOT entangled with the internal-assessment grading
 *   reconciliation blocked elsewhere (phase11 §2.2). Confirm against current
 *   MANEB rules before relying on the numeric boundary.
 * [DEPENDS ON]: none
 */

// ─────────────────────────────────────────────────────────
//  MSCE CREDIT THRESHOLD
// ─────────────────────────────────────────────────────────

/**
 * Worst MSCE grade digit that still counts as a "credit" on the MANEB 1–9
 * scale (1 = best … 9 = fail). Grades 1–6 are credits; 7–8 are passes; 9 is a
 * fail — so 6 is the worst credit grade. This is the default `maxGrade` for
 * any SubjectRequirement / SubjectGroupRequirement that does not specify its
 * own stricter ceiling. MSCE-only and numeric by design — applying it to JCE's
 * A–F letter scale would be a category error (phase11 §0.6 / §2.2).
 */
export const MSCE_CREDIT_MAX_GRADE = 6

// ─────────────────────────────────────────────────────────
//  ENTRY-REQUIREMENT SHAPE (Feature C matching input)
// ─────────────────────────────────────────────────────────

/** A single mandatory subject the programme requires at credit level. */
export interface SubjectRequirement {
  /** Matches a MALAWI_SUBJECTS entry (Title Case), e.g. 'Biology'. */
  subject: string
  /** Acceptable substitutes for this subject, e.g. Chemistry ↔ Physical Science. */
  alternatives?: string[]
  /** Worst acceptable MANEB grade (1 = best … 9 = fail); defaults to MSCE_CREDIT_MAX_GRADE. */
  maxGrade?: number
}

/** A "choose at least N of the following" subject group. */
export interface SubjectGroupRequirement {
  /** How many members of `subjects` must be satisfied. */
  chooseAtLeast: number
  /** Candidate subjects for this group (each a MALAWI_SUBJECTS-style name). */
  subjects: string[]
  /** Worst acceptable MANEB grade for a group member; defaults to MSCE_CREDIT_MAX_GRADE. */
  maxGrade?: number
}

/** The structured requirements the matching engine evaluates for a programme. */
export interface EntryRequirements {
  /** Minimum number of credit passes required overall (e.g. 6). */
  minTotalCredits: number
  /** Subjects that must each be held at credit level. */
  mandatorySubjects: SubjectRequirement[]
  /** Optional "any N of these" groups layered on top of the mandatory subjects. */
  groupSubjects?: SubjectGroupRequirement[]
}

// ─────────────────────────────────────────────────────────
//  CATALOGUE SHAPE
// ─────────────────────────────────────────────────────────

export interface UniversityProgram {
  id: string
  name: string
  faculty?: string
  durationYears?: number
  /** Human-readable display list — the requirement text as published. */
  minimumRequirements?: string[]
  /** Structured shape the matching engine evaluates. */
  entryRequirements?: EntryRequirements
  location?: string
  /** Aggregate cut-off points ceiling, where a university publishes one. */
  cutOffPoints?: number
  /** Intake year the `cutOffPoints` figure applies to. */
  cutOffPointsYear?: number
  /** Retire a programme without deleting placement history that references it. */
  isActive?: boolean
}

export interface University {
  id: string
  name: string
  shortName?: string
  location?: string
  /** ISO 3166-1 alpha-2 country code; 'MW' for Malawi public universities. */
  country?: string
  type?: 'PUBLIC' | 'PRIVATE' | 'FOREIGN'
  programs: UniversityProgram[]
}

// ─────────────────────────────────────────────────────────
//  CATALOGUE DATA — Malawi public universities (undergraduate)
// ─────────────────────────────────────────────────────────

/**
 * Curated catalogue of Malawi public universities and their MSCE-entry
 * undergraduate programmes. Private/foreign universities are handled via free
 * text on PlacementChoice / UniversityPlacement rather than curated entries.
 */
export const UNIVERSITIES: University[] = [
  // ─── MUST ────────────────────────────────────────────
  {
    id: 'must',
    name: 'Malawi University of Science and Technology',
    shortName: 'MUST',
    location: 'Thyolo / Limbe',
    country: 'MW',
    type: 'PUBLIC',
    programs: [
      {
        id: 'must-biomedical-engineering',
        name: 'Bachelor of Engineering (Hons) in Biomedical Engineering',
        faculty: 'Malawi Institute of Technology',
        durationYears: 5,
        location: 'Thyolo / Limbe',
        minimumRequirements: [
          'MSCE, "O" Level, IGCSE, GCE at least six credits including Biology, Physics, Chemistry (or Physical Science), Mathematics and English.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'Biology' },
            { subject: 'Physics' },
            { subject: 'Chemistry', alternatives: ['Physical Science'] },
            { subject: 'Mathematics' },
            { subject: 'English' },
          ],
        },
        isActive: true,
      },
      {
        id: 'must-chemical-engineering',
        name: 'Bachelor of Engineering (Hons) in Chemical Engineering',
        faculty: 'Malawi Institute of Technology',
        durationYears: 5,
        location: 'Thyolo / Limbe',
        minimumRequirements: [
          'MSCE, "O" Level, IGCSE, GCE at least six credits including Biology, Physics, Chemistry (or Physical Science), Mathematics and English.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'Biology' },
            { subject: 'Physics' },
            { subject: 'Chemistry', alternatives: ['Physical Science'] },
            { subject: 'Mathematics' },
            { subject: 'English' },
          ],
        },
        isActive: true,
      },
      {
        id: 'must-metallurgy-materials-engineering',
        name: 'Bachelor of Engineering (Hons) in Metallurgy and Materials Engineering',
        faculty: 'Malawi Institute of Technology',
        durationYears: 5,
        location: 'Thyolo / Limbe',
        minimumRequirements: [
          'MSCE, "O" Level, IGCSE, GCE at least six credits including Biology, Physics, Chemistry (or Physical Science), Mathematics and English.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'Biology' },
            { subject: 'Physics' },
            { subject: 'Chemistry', alternatives: ['Physical Science'] },
            { subject: 'Mathematics' },
            { subject: 'English' },
          ],
        },
        isActive: true,
      },
      {
        id: 'must-textile-engineering',
        name: 'Bachelor of Engineering (Hons) Textile Engineering',
        faculty: 'Malawi Institute of Technology',
        durationYears: 5,
        location: 'Thyolo / Limbe',
        minimumRequirements: [
          'MSCE, "O" Level, IGCSE, GCE with Six Credits including: Mathematics, English, Physics, Chemistry (or Physical Science).',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'Mathematics' },
            { subject: 'English' },
            { subject: 'Physics', alternatives: ['Physical Science'] },
            { subject: 'Chemistry', alternatives: ['Physical Science'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'must-manufacturing-engineering',
        name: 'Bachelor of Engineering (Hons) in Manufacturing Engineering',
        faculty: 'Malawi Institute of Technology',
        durationYears: 5,
        location: 'Thyolo / Limbe',
        minimumRequirements: [
          'MSCE, "O" Level, IGCSE, GCE with Six Credits including: Mathematics, English, Physics, Chemistry (or Physical Science).',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'Mathematics' },
            { subject: 'English' },
            { subject: 'Physics', alternatives: ['Physical Science'] },
            { subject: 'Chemistry', alternatives: ['Physical Science'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'must-computer-systems-security',
        name: 'Bachelor of Science in Computer Systems and Security',
        faculty: 'Malawi Institute of Technology',
        durationYears: 4,
        location: 'Thyolo / Limbe',
        minimumRequirements: [
          'MSCE, O-Level, IGCSE, GCE with Six Credits including: Mathematics, English, Physics (or Physical Science).',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'Mathematics' },
            { subject: 'English' },
            { subject: 'Physics', alternatives: ['Physical Science'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'must-business-information-technology',
        name: 'Bachelor of Science in Business Information Technology',
        faculty: 'Malawi Institute of Technology',
        durationYears: 4,
        location: 'Thyolo / Limbe',
        minimumRequirements: [
          'MSCE, O levels, IGCSE, GCE with Six Credits including: Mathematics, English and Physics.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'Mathematics' },
            { subject: 'English' },
            { subject: 'Physics' },
          ],
        },
        isActive: true,
      },
      {
        id: 'must-food-science-technology',
        name: 'Bachelor of Science in Food Science and Technology',
        faculty: 'Malawi Institute of Technology',
        durationYears: 4,
        location: 'Thyolo / Limbe',
        minimumRequirements: [
          'MSCE Level, IGCSE, GCE at least six credits including Biology, Physics, Chemistry (or Physical Science), Mathematics and English.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'Biology' },
            { subject: 'Physics' },
            { subject: 'Chemistry', alternatives: ['Physical Science'] },
            { subject: 'Mathematics' },
            { subject: 'English' },
          ],
        },
        isActive: true,
      },
      {
        id: 'must-mathematical-sciences',
        name: 'Bachelor of Science in Mathematical Sciences',
        faculty: 'Malawi Institute of Technology',
        durationYears: 4,
        location: 'Thyolo / Limbe',
        minimumRequirements: [
          'MSCE Level, IGCSE, GCE at least six credits including Biology, Physics, Chemistry (or Physical Science), Mathematics and English.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'Biology' },
            { subject: 'Physics' },
            { subject: 'Chemistry', alternatives: ['Physical Science'] },
            { subject: 'Mathematics' },
            { subject: 'English' },
          ],
        },
        isActive: true,
      },
      {
        id: 'must-sciences-education',
        name: 'Bachelor of Science in Sciences Education',
        faculty: 'Malawi Institute of Technology',
        durationYears: 4,
        location: 'Thyolo / Limbe',
        minimumRequirements: [
          'MSCE, O-Level, IGCSE, GCE at least six credits including Biology, Physics, Chemistry (or Physical Science), Mathematics and English.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'Biology' },
            { subject: 'Physics' },
            { subject: 'Chemistry', alternatives: ['Physical Science'] },
            { subject: 'Mathematics' },
            { subject: 'English' },
          ],
        },
        isActive: true,
      },
      {
        id: 'must-earth-science-geology',
        name: 'Bachelor of Science in Earth Science (Geology)',
        faculty: 'Ndata School of Climate and Earth Sciences',
        durationYears: 4,
        location: 'Thyolo / Limbe',
        minimumRequirements: [
          'MSCE, "O" Level, IGCSE, GCE at least six credits including Biology, Physics, Chemistry (or Physical Science), Mathematics, Geography and English.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'Biology' },
            { subject: 'Physics' },
            { subject: 'Chemistry', alternatives: ['Physical Science'] },
            { subject: 'Mathematics' },
            { subject: 'Geography' },
            { subject: 'English' },
          ],
        },
        isActive: true,
      },
      {
        id: 'must-meteorology-climate-science',
        name: 'Bachelor of Science in Meteorology and Climate Science',
        faculty: 'Ndata School of Climate and Earth Sciences',
        durationYears: 4,
        location: 'Thyolo / Limbe',
        minimumRequirements: [
          'MSCE with a minimum of six credits including Maths, Biology, Geography and Physical Science. A Pass in English at O level is a must.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'Mathematics' },
            { subject: 'Biology' },
            { subject: 'Geography' },
            { subject: 'Physical Science', alternatives: ['Chemistry', 'Physics'] },
            // English is required only at pass level (grade 7-8), not credit.
            { subject: 'English', maxGrade: 8 },
          ],
        },
        isActive: true,
      },
      {
        id: 'must-disaster-risk-management',
        name: 'Bachelor of Science in Disaster Risk Management',
        faculty: 'Ndata School of Climate and Earth Sciences',
        durationYears: 4,
        location: 'Thyolo / Limbe',
        minimumRequirements: [
          'MSCE, "O" Level, IGCSE, GCE at least six strong credits including: Geography, Physics, Chemistry (or Physical Science), Mathematics and English.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'Geography' },
            { subject: 'Physics' },
            { subject: 'Chemistry', alternatives: ['Physical Science'] },
            { subject: 'Mathematics' },
            { subject: 'English' },
          ],
        },
        isActive: true,
      },
      {
        id: 'must-sustainable-energy-systems',
        name: 'Bachelor of Science in Sustainable Energy Systems',
        faculty: 'Ndata School of Climate and Earth Sciences',
        durationYears: 4,
        location: 'Thyolo / Limbe',
        minimumRequirements: [
          'MSCE, "O" Level, IGCSE, GCE at least strong credits in Mathematics, Physical Science (Chemistry and Physics), English and any three of the following: Computer Studies, Agriculture, Biology and Geography.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'Mathematics' },
            { subject: 'Chemistry', alternatives: ['Physical Science'] },
            { subject: 'Physics', alternatives: ['Physical Science'] },
            { subject: 'English' },
          ],
          groupSubjects: [
            { chooseAtLeast: 3, subjects: ['Computer Studies', 'Agriculture', 'Biology', 'Geography'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'must-petroleum-geoscience',
        name: 'Bachelor of Science in Petroleum GeoScience (Oil and Gas)',
        faculty: 'Ndata School of Climate and Earth Sciences',
        durationYears: 4,
        location: 'Thyolo / Limbe',
        minimumRequirements: [
          'MSCE, "O" Level, IGCSE, GCE at least strong credits in Mathematics, Physics, Chemistry (or Physical Science), Geography and English and any of the following: Biology and Computer Studies.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'Mathematics' },
            { subject: 'Physics' },
            { subject: 'Chemistry', alternatives: ['Physical Science'] },
            { subject: 'Geography' },
            { subject: 'English' },
          ],
          groupSubjects: [
            { chooseAtLeast: 1, subjects: ['Biology', 'Computer Studies'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'must-water-quality-management',
        name: 'Bachelor of Science in Water Quality and Management',
        faculty: 'Ndata School of Climate and Earth Sciences',
        durationYears: 4,
        location: 'Thyolo / Limbe',
        minimumRequirements: [
          'MSCE, "O" Level, IGCSE, GCE at least strong credits in Mathematics, Geography and English and any four of the following: Computer Studies, Physics, Chemistry (or Physical Science), Agriculture and Biology.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'Mathematics' },
            { subject: 'Geography' },
            { subject: 'English' },
          ],
          groupSubjects: [
            { chooseAtLeast: 4, subjects: ['Computer Studies', 'Physics', 'Chemistry', 'Physical Science', 'Agriculture', 'Biology'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'must-geo-information-earth-observation',
        name: 'Bachelor of Science in Geo-Information and Earth Observation Science',
        faculty: 'Ndata School of Climate and Earth Sciences',
        durationYears: 4,
        location: 'Thyolo / Limbe',
        minimumRequirements: [
          'MSCE, "O" Level, IGCSE, GCE at least strong credits in Mathematics and English and any four of the following: Geography, Computer Studies, Physics, Chemistry (or Physical Science), Agriculture and Biology.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'Mathematics' },
            { subject: 'English' },
          ],
          groupSubjects: [
            { chooseAtLeast: 4, subjects: ['Geography', 'Computer Studies', 'Physics', 'Chemistry', 'Physical Science', 'Agriculture', 'Biology'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'must-language-communication-culture',
        name: 'Bachelor of Arts in Language, Communication and Culture',
        faculty: 'Bingu School of Culture and Heritage',
        durationYears: 4,
        location: 'Thyolo / Limbe',
        minimumRequirements: [
          'MSCE or its equivalent with at least six credit passes including English Language. In addition, a grade of no more than 4 in any two of: Social Studies, Life Skills, Bible Knowledge, History, Chichewa, and Geography.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [{ subject: 'English' }],
          groupSubjects: [
            { chooseAtLeast: 2, subjects: ['Social Studies', 'Life Skills', 'Bible Knowledge', 'History', 'Chichewa', 'Geography'], maxGrade: 4 },
          ],
        },
        isActive: true,
      },
      {
        id: 'must-indigenous-knowledge-systems',
        name: 'Bachelor of Arts in Indigenous Knowledge Systems and Practice',
        faculty: 'Bingu School of Culture and Heritage',
        durationYears: 4,
        location: 'Thyolo / Limbe',
        minimumRequirements: [
          'Six credits in MSCE or its equivalent including English, and a grade of no more than 4 in any three of: Social Studies, Life Skills, Bible Knowledge (Religious Studies), History, and Geography.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [{ subject: 'English' }],
          groupSubjects: [
            { chooseAtLeast: 3, subjects: ['Social Studies', 'Life Skills', 'Bible Knowledge', 'Religious and Moral Education', 'History', 'Geography'], maxGrade: 4 },
          ],
        },
        isActive: true,
      },
      {
        id: 'must-african-musicology',
        name: 'Bachelor of Arts in African Musicology',
        faculty: 'Bingu School of Culture and Heritage',
        durationYears: 4,
        location: 'Thyolo / Limbe',
        minimumRequirements: [
          'Six credits in MSCE and IGCSE ("O" level) or equivalent including English, and a combination of any two of: Social Studies, Life Skills, Bible Knowledge, History, Performing Art, and Geography.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [{ subject: 'English' }],
          groupSubjects: [
            { chooseAtLeast: 2, subjects: ['Social Studies', 'Life Skills', 'Bible Knowledge', 'History', 'Performing Arts', 'Geography'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'must-cultural-economy',
        name: 'Bachelor of Arts in Cultural Economy',
        faculty: 'Bingu School of Culture and Heritage',
        durationYears: 4,
        location: 'Thyolo / Limbe',
        minimumRequirements: [
          'Six credits in MSCE and IGCSE ("O" level) or equivalent including English and Mathematics, and a combination of any two of: Social Studies/Life Skills; Business Studies/Accounting; and Creative Arts/Geography.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [{ subject: 'English' }, { subject: 'Mathematics' }],
          groupSubjects: [
            { chooseAtLeast: 2, subjects: ['Social Studies', 'Life Skills', 'Business Studies', 'Creative Arts', 'Geography'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'must-medical-microbiology',
        name: 'Bachelor of Science in Medical Microbiology',
        faculty: 'Academy of Medical Sciences',
        durationYears: 4,
        location: 'Thyolo / Limbe',
        minimumRequirements: [
          'MSCE, "O" Level, IGCSE, GCE at least six credits including Biology, Physics, Chemistry (or Physical Science), Mathematics and English.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'Biology' },
            { subject: 'Physics' },
            { subject: 'Chemistry', alternatives: ['Physical Science'] },
            { subject: 'Mathematics' },
            { subject: 'English' },
          ],
        },
        isActive: true,
      },
      {
        id: 'must-medical-imaging',
        name: 'Bachelor of Science in Medical Imaging',
        faculty: 'Academy of Medical Sciences',
        durationYears: 4,
        location: 'Thyolo / Limbe',
        minimumRequirements: [
          'MSCE, "O" Level, IGCSE, and GCE at least six credits including Biology, Physics, Chemistry (or Physical Science), Mathematics and English.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'Biology' },
            { subject: 'Physics' },
            { subject: 'Chemistry', alternatives: ['Physical Science'] },
            { subject: 'Mathematics' },
            { subject: 'English' },
          ],
        },
        isActive: true,
      },
      {
        id: 'must-immunology',
        name: 'Bachelor of Science in Immunology',
        faculty: 'Academy of Medical Sciences',
        durationYears: 4,
        location: 'Thyolo / Limbe',
        minimumRequirements: [
          'MSCE, "O" Level, IGCSE, and GCE at least six credits including Biology, Physics, Chemistry (or Physical Science), Mathematics and English.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'Biology' },
            { subject: 'Physics' },
            { subject: 'Chemistry', alternatives: ['Physical Science'] },
            { subject: 'Mathematics' },
            { subject: 'English' },
          ],
        },
        isActive: true,
      },
      {
        id: 'must-sports-science',
        name: 'Bachelor of Science in Sports Science',
        faculty: 'Academy of Medical Sciences',
        durationYears: 4,
        location: 'Thyolo / Limbe',
        minimumRequirements: [
          'Six credits in MSCE or its equivalent including English, and a grade of no more than 4 in Biology, Physical Science (Physics or Chemistry), and Mathematics.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Biology', maxGrade: 4 },
            { subject: 'Physical Science', alternatives: ['Physics', 'Chemistry'], maxGrade: 4 },
            { subject: 'Mathematics', maxGrade: 4 },
          ],
        },
        isActive: true,
      },
    ],
  },

  // ─── MUBAS ───────────────────────────────────────────
  {
    id: 'mubas',
    name: 'Malawi University of Business and Applied Sciences',
    shortName: 'MUBAS',
    location: 'Blantyre',
    country: 'MW',
    type: 'PUBLIC',
    programs: [
      {
        id: 'mubas-architectural-studies',
        name: 'Bachelor of Science in Architectural Studies',
        faculty: 'School of Built Environment',
        durationYears: 4,
        location: 'Blantyre',
        minimumRequirements: ['Six credits at MSCE including English, Mathematics, General Science or Chemistry & Physics or its equivalent.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Chemistry', alternatives: ['General Science'] },
            { subject: 'Physics', alternatives: ['General Science'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'mubas-land-economy',
        name: 'Bachelor of Science in Land Economy (Honours)',
        faculty: 'School of Built Environment',
        durationYears: 5,
        location: 'Blantyre',
        minimumRequirements: ['Six credits at MSCE including English, Mathematics, General Science or Chemistry & Physics or its equivalent.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Chemistry', alternatives: ['General Science'] },
            { subject: 'Physics', alternatives: ['General Science'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'mubas-land-surveying',
        name: 'Bachelor of Science in Land Surveying (Honours)',
        faculty: 'School of Built Environment',
        durationYears: 5,
        location: 'Blantyre',
        minimumRequirements: ['Six credits at MSCE including English, Mathematics, General Science or Chemistry & Physics or its equivalent.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Chemistry', alternatives: ['General Science'] },
            { subject: 'Physics', alternatives: ['General Science'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'mubas-physical-planning',
        name: 'Bachelor of Science in Physical Planning (Honours)',
        faculty: 'School of Built Environment',
        durationYears: 5,
        location: 'Blantyre',
        minimumRequirements: ['Six credits at MSCE including English, Mathematics, General Science or Chemistry & Physics and Geography or its equivalent.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Chemistry', alternatives: ['General Science'] },
            { subject: 'Physics', alternatives: ['General Science'] },
            { subject: 'Geography' },
          ],
        },
        isActive: true,
      },
      {
        id: 'mubas-quantity-surveying',
        name: 'Bachelor of Science in Quantity Surveying (Honours)',
        faculty: 'School of Built Environment',
        durationYears: 5,
        location: 'Blantyre',
        minimumRequirements: ['Six credits at MSCE including English, Mathematics, General Science or Chemistry & Physics and Geography or its equivalent.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Chemistry', alternatives: ['General Science'] },
            { subject: 'Physics', alternatives: ['General Science'] },
            { subject: 'Geography' },
          ],
        },
        isActive: true,
      },
      {
        id: 'mubas-accountancy',
        name: 'Bachelor of Accountancy',
        faculty: 'School of Business and Economic Sciences',
        durationYears: 4,
        location: 'Blantyre',
        minimumRequirements: ['Six credits at MSCE including English and Mathematics or its equivalent.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [{ subject: 'English' }, { subject: 'Mathematics' }],
        },
        isActive: true,
      },
      {
        id: 'mubas-bba-generic',
        name: 'Bachelor of Business Administration (Generic)',
        faculty: 'School of Business and Economic Sciences',
        durationYears: 4,
        location: 'Blantyre',
        minimumRequirements: ['Six credits at MSCE including English and Mathematics or its equivalent.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [{ subject: 'English' }, { subject: 'Mathematics' }],
        },
        isActive: true,
      },
      {
        id: 'mubas-bba-marketing',
        name: 'Bachelor of Business Administration (Marketing)',
        faculty: 'School of Business and Economic Sciences',
        durationYears: 4,
        location: 'Blantyre',
        minimumRequirements: ['Six credits at MSCE including English and Mathematics or its equivalent.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [{ subject: 'English' }, { subject: 'Mathematics' }],
        },
        isActive: true,
      },
      {
        id: 'mubas-commerce-internal-audit',
        name: 'Bachelor of Commerce in Internal Audit',
        faculty: 'School of Business and Economic Sciences',
        durationYears: 4,
        location: 'Blantyre',
        minimumRequirements: ['Six credits at MSCE including English and Mathematics or its equivalent.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [{ subject: 'English' }, { subject: 'Mathematics' }],
        },
        isActive: true,
      },
      {
        id: 'mubas-commerce-banking-finance',
        name: 'Bachelor of Commerce (Banking and Finance)',
        faculty: 'School of Business and Economic Sciences',
        durationYears: 4,
        location: 'Blantyre',
        minimumRequirements: ['Six credits at MSCE including English and Mathematics or its equivalent.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [{ subject: 'English' }, { subject: 'Mathematics' }],
        },
        isActive: true,
      },
      {
        id: 'mubas-commerce-entrepreneurship',
        name: 'Bachelor of Commerce (Entrepreneurship)',
        faculty: 'School of Business and Economic Sciences',
        durationYears: 4,
        location: 'Blantyre',
        minimumRequirements: ['Six credits at MSCE including English and Mathematics or its equivalent.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [{ subject: 'English' }, { subject: 'Mathematics' }],
        },
        isActive: true,
      },
      {
        id: 'mubas-commerce-tourism-management',
        name: 'Bachelor of Commerce (Tourism Management)',
        faculty: 'School of Business and Economic Sciences',
        durationYears: 4,
        location: 'Blantyre',
        minimumRequirements: ['Six credits at MSCE including English and Mathematics or its equivalent.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [{ subject: 'English' }, { subject: 'Mathematics' }],
        },
        isActive: true,
      },
      {
        id: 'mubas-commerce-taxation',
        name: 'Bachelor of Commerce (Taxation)',
        faculty: 'School of Business and Economic Sciences',
        durationYears: 4,
        location: 'Blantyre',
        minimumRequirements: ['Six credits at MSCE including English and Mathematics or its equivalent.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [{ subject: 'English' }, { subject: 'Mathematics' }],
        },
        isActive: true,
      },
      {
        id: 'mubas-business-communication',
        name: 'Bachelor of Business Communication',
        faculty: 'School of Education, Communication and Media Studies',
        durationYears: 4,
        location: 'Blantyre',
        minimumRequirements: ['Six credits at MSCE including English and at least a pass in Mathematics or its equivalent.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [{ subject: 'English' }, { subject: 'Mathematics', maxGrade: 8 }],
        },
        isActive: true,
      },
      {
        id: 'mubas-journalism',
        name: 'Bachelor of Arts in Journalism',
        faculty: 'School of Education, Communication and Media Studies',
        durationYears: 4,
        location: 'Blantyre',
        minimumRequirements: ['Six credits at MSCE including English and at least a pass in Mathematics or its equivalent.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [{ subject: 'English' }, { subject: 'Mathematics', maxGrade: 8 }],
        },
        isActive: true,
      },
      {
        id: 'mubas-education-business-studies',
        name: 'Bachelor of Education (Business Studies)',
        faculty: 'School of Education, Communication and Media Studies',
        durationYears: 4,
        location: 'Blantyre',
        minimumRequirements: ['Six credits at MSCE including English and Mathematics or its equivalent.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [{ subject: 'English' }, { subject: 'Mathematics' }],
        },
        isActive: true,
      },
      {
        id: 'mubas-technical-education-science',
        name: 'Bachelor of Technical Education (Science)',
        faculty: 'School of Education, Communication and Media Studies',
        durationYears: 4,
        location: 'Blantyre',
        minimumRequirements: ['Six credits at MSCE including English, Mathematics, General Science or Chemistry & Physics or its equivalent.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Chemistry', alternatives: ['General Science'] },
            { subject: 'Physics', alternatives: ['General Science'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'mubas-technical-education-technology',
        name: 'Bachelor of Technical Education (Technology)',
        faculty: 'School of Education, Communication and Media Studies',
        durationYears: 4,
        location: 'Blantyre',
        minimumRequirements: ['Six credits at MSCE including English, Mathematics, General Science or Chemistry & Physics or its equivalent.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Chemistry', alternatives: ['General Science'] },
            { subject: 'Physics', alternatives: ['General Science'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'mubas-biomedical-engineering',
        name: 'Bachelor of Biomedical Engineering (Honours)',
        faculty: 'School of Engineering',
        durationYears: 5,
        location: 'Blantyre',
        minimumRequirements: ['Six credits at MSCE including English, Mathematics, Biology, General Science or Chemistry & Physics or its equivalent.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Biology' },
            { subject: 'Chemistry', alternatives: ['General Science'] },
            { subject: 'Physics', alternatives: ['General Science'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'mubas-automobile-engineering',
        name: 'Bachelor of Automobile Engineering (Honours)',
        faculty: 'School of Engineering',
        durationYears: 5,
        location: 'Blantyre',
        minimumRequirements: ['Six credits at MSCE including English, Mathematics, General Science or Chemistry & Physics or its equivalent.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Chemistry', alternatives: ['General Science'] },
            { subject: 'Physics', alternatives: ['General Science'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'mubas-civil-engineering-structures',
        name: 'Bachelor of Civil Engineering - Structures (Honours)',
        faculty: 'School of Engineering',
        durationYears: 5,
        location: 'Blantyre',
        minimumRequirements: ['Six credits at MSCE including English, Mathematics, General Science or Chemistry & Physics or its equivalent.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Chemistry', alternatives: ['General Science'] },
            { subject: 'Physics', alternatives: ['General Science'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'mubas-civil-engineering-transportation',
        name: 'Bachelor of Civil Engineering - Transportation (Honours)',
        faculty: 'School of Engineering',
        durationYears: 5,
        location: 'Blantyre',
        minimumRequirements: ['Six credits at MSCE including English, Mathematics, General Science or Chemistry & Physics or its equivalent.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Chemistry', alternatives: ['General Science'] },
            { subject: 'Physics', alternatives: ['General Science'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'mubas-civil-engineering-water',
        name: 'Bachelor of Civil Engineering - Water (Honours)',
        faculty: 'School of Engineering',
        durationYears: 5,
        location: 'Blantyre',
        minimumRequirements: ['Six credits at MSCE including English, Mathematics, General Science or Chemistry & Physics or its equivalent.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Chemistry', alternatives: ['General Science'] },
            { subject: 'Physics', alternatives: ['General Science'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'mubas-electronics-computer-engineering',
        name: 'Bachelor of Electronics and Computer Engineering (Honours)',
        faculty: 'School of Engineering',
        durationYears: 5,
        location: 'Blantyre',
        minimumRequirements: ['Six credits at MSCE including English, Mathematics, General Science or Chemistry & Physics or its equivalent.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Chemistry', alternatives: ['General Science'] },
            { subject: 'Physics', alternatives: ['General Science'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'mubas-electrical-electronics-engineering',
        name: 'Bachelor of Electrical and Electronics Engineering (Honours)',
        faculty: 'School of Engineering',
        durationYears: 5,
        location: 'Blantyre',
        minimumRequirements: ['Six credits at MSCE including English, Mathematics, General Science or Chemistry & Physics or its equivalent.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Chemistry', alternatives: ['General Science'] },
            { subject: 'Physics', alternatives: ['General Science'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'mubas-electronics-telecommunication-engineering',
        name: 'Bachelor of Electronics and Telecommunication Engineering (Honours)',
        faculty: 'School of Engineering',
        durationYears: 5,
        location: 'Blantyre',
        minimumRequirements: ['Six credits at MSCE including English, Mathematics, General Science or Chemistry & Physics or its equivalent.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Chemistry', alternatives: ['General Science'] },
            { subject: 'Physics', alternatives: ['General Science'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'mubas-energy-engineering',
        name: 'Bachelor of Energy Engineering (Honours)',
        faculty: 'School of Engineering',
        durationYears: 5,
        location: 'Blantyre',
        minimumRequirements: ['Six credits at MSCE including English, Mathematics, General Science or Chemistry & Physics or its equivalent.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Chemistry', alternatives: ['General Science'] },
            { subject: 'Physics', alternatives: ['General Science'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'mubas-geological-engineering',
        name: 'Bachelor of Geological Engineering (Honours)',
        faculty: 'School of Engineering',
        durationYears: 5,
        location: 'Blantyre',
        minimumRequirements: ['Six credits at MSCE including English, Mathematics, General Science or Chemistry & Physics or its equivalent.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Chemistry', alternatives: ['General Science'] },
            { subject: 'Physics', alternatives: ['General Science'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'mubas-industrial-engineering',
        name: 'Bachelor of Industrial Engineering (Honours)',
        faculty: 'School of Engineering',
        durationYears: 5,
        location: 'Blantyre',
        minimumRequirements: ['Six credits at MSCE including English, Mathematics, General Science or Chemistry & Physics or its equivalent.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Chemistry', alternatives: ['General Science'] },
            { subject: 'Physics', alternatives: ['General Science'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'mubas-mechanical-engineering',
        name: 'Bachelor of Mechanical Engineering (Honours)',
        faculty: 'School of Engineering',
        durationYears: 5,
        location: 'Blantyre',
        minimumRequirements: ['Six credits at MSCE including English, Mathematics, General Science or Chemistry & Physics or its equivalent.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Chemistry', alternatives: ['General Science'] },
            { subject: 'Physics', alternatives: ['General Science'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'mubas-metallurgy-mineral-processing',
        name: 'Bachelor of Metallurgy and Mineral Processing Engineering (Honours)',
        faculty: 'School of Engineering',
        durationYears: 5,
        location: 'Blantyre',
        minimumRequirements: ['Six credits at MSCE including English, Mathematics, General Science or Chemistry & Physics or its equivalent.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Chemistry', alternatives: ['General Science'] },
            { subject: 'Physics', alternatives: ['General Science'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'mubas-mining-engineering',
        name: 'Bachelor of Mining Engineering (Honours)',
        faculty: 'School of Engineering',
        durationYears: 5,
        location: 'Blantyre',
        minimumRequirements: ['Six credits at MSCE including English, Mathematics, General Science or Chemistry & Physics or its equivalent.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Chemistry', alternatives: ['General Science'] },
            { subject: 'Physics', alternatives: ['General Science'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'mubas-environmental-health',
        name: 'Bachelor of Science in Environmental Health',
        faculty: 'School of Science and Technology',
        durationYears: 4,
        location: 'Blantyre',
        minimumRequirements: ['Six credits at MSCE including English, Mathematics, Biology and Physical Science or General Science or Chemistry & Physics or its equivalent.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Biology' },
            { subject: 'Chemistry', alternatives: ['Physical Science', 'General Science'] },
            { subject: 'Physics', alternatives: ['Physical Science', 'General Science'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'mubas-environmental-management-technology',
        name: 'Bachelor of Science in Environmental Management and Technology',
        faculty: 'School of Science and Technology',
        durationYears: 4,
        location: 'Blantyre',
        minimumRequirements: ['Six credits at MSCE including English, Mathematics, Biology, General Science or Chemistry & Physics or its equivalent.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Biology' },
            { subject: 'Chemistry', alternatives: ['General Science'] },
            { subject: 'Physics', alternatives: ['General Science'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'mubas-industrial-environmental-physics',
        name: 'Bachelor of Science in Industrial and Environmental Physics',
        faculty: 'School of Science and Technology',
        durationYears: 4,
        location: 'Blantyre',
        minimumRequirements: ['Six credits at MSCE including English, Mathematics, Biology, General Science or Chemistry & Physics or its equivalent.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Biology' },
            { subject: 'Chemistry', alternatives: ['General Science'] },
            { subject: 'Physics', alternatives: ['General Science'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'mubas-food-science-technology',
        name: 'Bachelor of Science in Food Science and Technology',
        faculty: 'School of Science and Technology',
        durationYears: 4,
        location: 'Blantyre',
        minimumRequirements: ['Six credits at MSCE including English, Mathematics, Biology, General Science or Chemistry & Physics or its equivalent.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Biology' },
            { subject: 'Chemistry', alternatives: ['General Science'] },
            { subject: 'Physics', alternatives: ['General Science'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'mubas-industrial-laboratory-technology',
        name: 'Bachelor of Science in Industrial Laboratory Technology',
        faculty: 'School of Science and Technology',
        durationYears: 4,
        location: 'Blantyre',
        minimumRequirements: ['Six credits at MSCE including English, Mathematics, Biology, General Science or Chemistry & Physics or its equivalent.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Biology' },
            { subject: 'Chemistry', alternatives: ['General Science'] },
            { subject: 'Physics', alternatives: ['General Science'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'mubas-information-technology',
        name: 'Bachelor of Science in Information Technology',
        faculty: 'School of Science and Technology',
        durationYears: 4,
        location: 'Blantyre',
        minimumRequirements: ['Six credits at MSCE including English, Mathematics, Biology, General Science or Chemistry & Physics or its equivalent.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Biology' },
            { subject: 'Chemistry', alternatives: ['General Science'] },
            { subject: 'Physics', alternatives: ['General Science'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'mubas-management-information-systems',
        name: 'Bachelor of Science in Management Information Systems',
        faculty: 'School of Science and Technology',
        durationYears: 4,
        location: 'Blantyre',
        minimumRequirements: ['Six credits at MSCE including English, Mathematics, Biology, General Science or Chemistry & Physics or its equivalent.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Biology' },
            { subject: 'Chemistry', alternatives: ['General Science'] },
            { subject: 'Physics', alternatives: ['General Science'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'mubas-mathematical-sciences-education',
        name: 'Bachelor of Science in Mathematical Sciences Education',
        faculty: 'School of Science and Technology',
        durationYears: 4,
        location: 'Blantyre',
        minimumRequirements: ['Six credits at MSCE including English, Mathematics, Biology, General Science or Chemistry & Physics or its equivalent.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Biology' },
            { subject: 'Chemistry', alternatives: ['General Science'] },
            { subject: 'Physics', alternatives: ['General Science'] },
          ],
        },
        isActive: true,
      },
    ],
  },

  // ─── UNIMA ───────────────────────────────────────────
  {
    id: 'unima',
    name: 'University of Malawi',
    shortName: 'UNIMA',
    location: 'Zomba',
    country: 'MW',
    type: 'PUBLIC',
    programs: [
      {
        id: 'unima-bed-biological-sciences',
        name: 'Bachelor of Education (Biological Sciences)',
        faculty: 'School of Education',
        durationYears: 4,
        location: 'Zomba',
        minimumRequirements: [
          'MSCE or GCSE/IGCSE/GCE with six credits including English, with a distinction or strong credit in Mathematics, Biology, Physics and Chemistry.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Biology' },
            { subject: 'Physics' },
            { subject: 'Chemistry' },
          ],
        },
        isActive: true,
      },
      {
        id: 'unima-bed-chemistry',
        name: 'Bachelor of Education in Chemistry',
        faculty: 'School of Education',
        durationYears: 4,
        location: 'Zomba',
        minimumRequirements: [
          'MSCE or GCSE/IGCSE/GCE with six credits including English, with a distinction or strong credit in Chemistry/Physics/Physical Science and Mathematics.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Chemistry', alternatives: ['Physics', 'Physical Science'] },
            { subject: 'Mathematics' },
          ],
        },
        isActive: true,
      },
      {
        id: 'unima-bed-computer-sciences',
        name: 'Bachelor of Education (Computer Sciences)',
        faculty: 'School of Education',
        durationYears: 4,
        location: 'Zomba',
        minimumRequirements: [
          'MSCE or GCSE/IGCSE/GCE with six credits including English, with a distinction or credit in Mathematics/Additional Mathematics and credits in any other four science subjects.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
          ],
          groupSubjects: [
            { chooseAtLeast: 4, subjects: ['Biology', 'Physics', 'Chemistry', 'Computer Studies', 'Agriculture', 'Geography'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'unima-bed-human-ecology',
        name: 'Bachelor of Education (Human Ecology)',
        faculty: 'School of Education',
        durationYears: 4,
        location: 'Zomba',
        minimumRequirements: [
          'MSCE or GCSE/IGCSE/GCE with six credits including English, with a distinction or strong credit in Mathematics, Biology, Physics and Chemistry.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Biology' },
            { subject: 'Physics' },
            { subject: 'Chemistry' },
          ],
        },
        isActive: true,
      },
      {
        id: 'unima-bed-language',
        name: 'Bachelor of Education (Language)',
        faculty: 'School of Education',
        durationYears: 4,
        location: 'Zomba',
        minimumRequirements: [
          'MSCE or GCSE/IGCSE/GCE with six credits including English, Chichewa, French and any other three subjects.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Chichewa' },
            { subject: 'French' },
          ],
        },
        isActive: true,
      },
      {
        id: 'unima-bed-mathematics',
        name: 'Bachelor of Education (Mathematics)',
        faculty: 'School of Education',
        durationYears: 4,
        location: 'Zomba',
        minimumRequirements: [
          'MSCE or GCSE/IGCSE/GCE with six credits including a distinction in Mathematics/Additional Mathematics, at least a credit in English, and credits in any other four science subjects.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'Mathematics' },
            { subject: 'English' },
          ],
          groupSubjects: [
            { chooseAtLeast: 4, subjects: ['Biology', 'Physics', 'Chemistry', 'Computer Studies', 'Agriculture', 'Geography'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'unima-bed-physics',
        name: 'Bachelor of Education (Physics)',
        faculty: 'School of Education',
        durationYears: 4,
        location: 'Zomba',
        minimumRequirements: [
          'MSCE or GCSE/IGCSE/GCE with six credits including a distinction in Mathematics/Additional Mathematics, at least a credit in English, and credits in any other four science subjects.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'Mathematics' },
            { subject: 'English' },
          ],
          groupSubjects: [
            { chooseAtLeast: 4, subjects: ['Biology', 'Physics', 'Chemistry', 'Computer Studies', 'Agriculture', 'Geography'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'unima-bed-social-studies',
        name: 'Bachelor of Education (Social Studies)',
        faculty: 'School of Education',
        durationYears: 4,
        location: 'Zomba',
        minimumRequirements: [
          'MSCE or GCSE/IGCSE/GCE with six credits including English, Chichewa, French and any other three subjects.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Chichewa' },
            { subject: 'French' },
          ],
        },
        isActive: true,
      },
      {
        id: 'unima-ba-communication-cultural-studies',
        name: 'Bachelor of Arts (Communication and Cultural Studies)',
        faculty: 'Faculty of Humanities',
        durationYears: 4,
        location: 'Zomba',
        minimumRequirements: [
          'Six credits at MSCE or its equivalent including English, plus any other two humanities subjects (e.g. another language, History, Geography, or Social Studies).',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [{ subject: 'English' }],
          groupSubjects: [
            { chooseAtLeast: 2, subjects: ['Chichewa', 'French', 'History', 'Geography', 'Social Studies'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'unima-ba-humanities',
        name: 'Bachelor of Arts (Humanities)',
        faculty: 'Faculty of Humanities',
        durationYears: 4,
        location: 'Zomba',
        minimumRequirements: [
          'Six credits at MSCE or its equivalent including English, plus any other two humanities subjects (e.g. another language, History, Geography, or Social Studies).',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [{ subject: 'English' }],
          groupSubjects: [
            { chooseAtLeast: 2, subjects: ['Chichewa', 'French', 'History', 'Geography', 'Social Studies'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'unima-ba-media-for-development',
        name: 'Bachelor of Arts (Media for Development)',
        faculty: 'Faculty of Humanities',
        durationYears: 4,
        location: 'Zomba',
        minimumRequirements: [
          'Six credits at MSCE or its equivalent including English, plus any other two humanities subjects (e.g. another language, History, Geography, or Social Studies).',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [{ subject: 'English' }],
          groupSubjects: [
            { chooseAtLeast: 2, subjects: ['Chichewa', 'French', 'History', 'Geography', 'Social Studies'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'unima-ba-theology',
        name: 'Bachelor of Arts (Theology)',
        faculty: 'Faculty of Humanities',
        durationYears: 4,
        location: 'Zomba',
        minimumRequirements: [
          'Six credits at MSCE or its equivalent including English, plus any other two humanities subjects (e.g. another language, History, Geography, or Social Studies).',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [{ subject: 'English' }],
          groupSubjects: [
            { chooseAtLeast: 2, subjects: ['Chichewa', 'French', 'History', 'Geography', 'Social Studies'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'unima-bsc-generic',
        name: 'Bachelor of Science (Generic)',
        faculty: 'Faculty of Science',
        durationYears: 4,
        location: 'Zomba',
        minimumRequirements: [
          'Year 1 entry: MSCE, "O" Level, IGCSE, or GCE with at least six credits including English, Mathematics, Biology and Physical Science/General Science.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Biology' },
            { subject: 'Physical Science', alternatives: ['General Science', 'Chemistry', 'Physics'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'unima-bsc-biological-sciences',
        name: 'Bachelor of Science in Biological Sciences',
        faculty: 'Faculty of Science',
        durationYears: 4,
        location: 'Zomba',
        minimumRequirements: [
          'MSCE or its equivalent with at least six credits including English, Biology, Mathematics and Physical Science/General Science.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Biology' },
            { subject: 'Mathematics' },
            { subject: 'Physical Science', alternatives: ['General Science', 'Chemistry', 'Physics'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'unima-bsc-computer-network-engineering',
        name: 'Bachelor of Science in Computer Network Engineering',
        faculty: 'Faculty of Science',
        durationYears: 4,
        location: 'Zomba',
        minimumRequirements: [
          'MSCE, "O" Level or IGCSE with at least 6 credits including Mathematics, English and Physics/Physical Science.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'Mathematics' },
            { subject: 'English' },
            { subject: 'Physics', alternatives: ['Physical Science'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'unima-bsc-computer-science',
        name: 'Bachelor of Science in Computer Science',
        faculty: 'Faculty of Science',
        durationYears: 4,
        location: 'Zomba',
        minimumRequirements: [
          'MSCE, "O" Level or IGCSE with at least 6 credits including Mathematics, English and Physics/Physical Science.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'Mathematics' },
            { subject: 'English' },
            { subject: 'Physics', alternatives: ['Physical Science'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'unima-early-childhood-development',
        name: 'Bachelor of Early Childhood Development',
        faculty: 'Faculty of Science',
        durationYears: 4,
        location: 'Zomba',
        minimumRequirements: [
          'Six credits at MSCE or its equivalent including English and Mathematics.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [{ subject: 'English' }, { subject: 'Mathematics' }],
        },
        isActive: true,
      },
      {
        id: 'unima-bsc-electronics',
        name: 'Bachelor of Science in Electronics',
        faculty: 'Faculty of Science',
        durationYears: 4,
        location: 'Zomba',
        minimumRequirements: [
          'MSCE or GCSE/IGCSE/GCE with at least six credits including Mathematics, Physics/Physical Science and English.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'Mathematics' },
            { subject: 'Physics', alternatives: ['Physical Science'] },
            { subject: 'English' },
          ],
        },
        isActive: true,
      },
      {
        id: 'unima-bsc-information-systems',
        name: 'Bachelor of Science in Information Systems',
        faculty: 'Faculty of Science',
        durationYears: 4,
        location: 'Zomba',
        minimumRequirements: [
          'MSCE, "O" Level or IGCSE with at least 6 credits including Mathematics, English and Physics/Physical Science.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'Mathematics' },
            { subject: 'English' },
            { subject: 'Physics', alternatives: ['Physical Science'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'unima-bsc-mathematics',
        name: 'Bachelor of Science in Mathematics',
        faculty: 'Faculty of Science',
        durationYears: 4,
        location: 'Zomba',
        minimumRequirements: [
          'MSCE or GCSE/IGCSE/GCE with a strong credit in Mathematics/Additional Mathematics and at least a credit in five other subjects including English, Physical Science and Biology.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'Mathematics' },
            { subject: 'English' },
            { subject: 'Physical Science', alternatives: ['Chemistry', 'Physics'] },
            { subject: 'Biology' },
          ],
        },
        isActive: true,
      },
      {
        id: 'unima-bsc-physics',
        name: 'Bachelor of Science in Physics',
        faculty: 'Faculty of Science',
        durationYears: 4,
        location: 'Zomba',
        minimumRequirements: [
          'MSCE or GCSE/IGCSE/GCE with at least six credits including Mathematics, Physics/Physical Science and English.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'Mathematics' },
            { subject: 'Physics', alternatives: ['Physical Science'] },
            { subject: 'English' },
          ],
        },
        isActive: true,
      },
      {
        id: 'unima-bsc-statistics',
        name: 'Bachelor of Science in Statistics',
        faculty: 'Faculty of Science',
        durationYears: 4,
        location: 'Zomba',
        minimumRequirements: [
          'MSCE or GCSE/IGCSE/GCE with a strong credit in Mathematics/Additional Mathematics and at least a credit in five other subjects including English, Physical Science and Biology.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'Mathematics' },
            { subject: 'English' },
            { subject: 'Physical Science', alternatives: ['Chemistry', 'Physics'] },
            { subject: 'Biology' },
          ],
        },
        isActive: true,
      },
      {
        id: 'unima-bsc-geography',
        name: 'Bachelor of Science in Geography',
        faculty: 'Faculty of Science',
        durationYears: 4,
        location: 'Zomba',
        minimumRequirements: [
          'MSCE, "O" Level, IGCSE, or GCE with at least a credit in Geography, Mathematics, and English and a credit in any other three subjects (such as Biology, Physics, Chemistry, Computer Studies, Agriculture, Social Studies).',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'Geography' },
            { subject: 'Mathematics' },
            { subject: 'English' },
          ],
          groupSubjects: [
            { chooseAtLeast: 3, subjects: ['Biology', 'Physics', 'Chemistry', 'Computer Studies', 'Agriculture', 'Social Studies'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'unima-bsc-geology',
        name: 'Bachelor of Science in Geology',
        faculty: 'Faculty of Science',
        durationYears: 4,
        location: 'Zomba',
        minimumRequirements: [
          'MSCE, "O" Level, IGCSE, or GCE with six credits including Geography, Mathematics, English, Biology, and Physics/Chemistry/General Science.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'Geography' },
            { subject: 'Mathematics' },
            { subject: 'English' },
            { subject: 'Biology' },
            { subject: 'Physics', alternatives: ['Chemistry', 'General Science'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'unima-bsc-food-nutrition',
        name: 'Bachelor of Science in Food and Nutrition',
        faculty: 'Faculty of Science',
        durationYears: 4,
        location: 'Zomba',
        minimumRequirements: [
          'Year 1 entry: MSCE, "O" Level, IGCSE, or GCE with at least six credits including English, Mathematics, Biology and Physical Science/General Science.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Biology' },
            { subject: 'Physical Science', alternatives: ['General Science', 'Chemistry', 'Physics'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'unima-bsc-family-consumer-sciences',
        name: 'Bachelor of Science in Family and Consumer Sciences',
        faculty: 'Faculty of Science',
        durationYears: 4,
        location: 'Zomba',
        minimumRequirements: [
          'Year 1 entry: MSCE, "O" Level, IGCSE, or GCE with at least six credits including English, Mathematics, Biology and Physical Science/General Science.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Biology' },
            { subject: 'Physical Science', alternatives: ['General Science', 'Chemistry', 'Physics'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'unima-ba-development-economics',
        name: 'Bachelor of Arts in Development Economics',
        faculty: 'Faculty of Social Science',
        durationYears: 4,
        location: 'Zomba',
        minimumRequirements: ['Six credits including Mathematics and English Language at MSCE or "O" level.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [{ subject: 'Mathematics' }, { subject: 'English' }],
        },
        isActive: true,
      },
      {
        id: 'unima-ba-sociology',
        name: 'Bachelor of Arts in Sociology',
        faculty: 'Faculty of Social Science',
        durationYears: 4,
        location: 'Zomba',
        minimumRequirements: ['MSCE, "O" Level, IGCSE, GCE with credits in Mathematics and English.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [{ subject: 'Mathematics' }, { subject: 'English' }],
        },
        isActive: true,
      },
      {
        id: 'unima-ba-psychology',
        name: 'Bachelor of Arts in Psychology',
        faculty: 'Faculty of Social Science',
        durationYears: 4,
        location: 'Zomba',
        minimumRequirements: ['MSCE, "O" Level, IGCSE, GCE with credits in Mathematics and English.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [{ subject: 'Mathematics' }, { subject: 'English' }],
        },
        isActive: true,
      },
      {
        id: 'unima-bss-gender-studies',
        name: 'Bachelor of Social Science in Gender Studies',
        faculty: 'Faculty of Social Science',
        durationYears: 4,
        location: 'Zomba',
        minimumRequirements: ["Six credits at MSCE or O' Level including English."],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [{ subject: 'English' }],
        },
        isActive: true,
      },
      {
        id: 'unima-bss-social-work',
        name: 'Bachelor of Social Science (Social Work)',
        faculty: 'Faculty of Social Science',
        durationYears: 4,
        location: 'Zomba',
        minimumRequirements: ["Six credits at MSCE or O' Level including English."],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [{ subject: 'English' }],
        },
        isActive: true,
      },
      {
        id: 'unima-ba-public-administration',
        name: 'Bachelor of Arts in Public Administration',
        faculty: 'Faculty of Social Science',
        durationYears: 4,
        location: 'Zomba',
        minimumRequirements: ["Six credits at MSCE or O' Level including English."],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [{ subject: 'English' }],
        },
        isActive: true,
      },
      {
        id: 'unima-ba-political-science',
        name: 'Bachelor of Arts in Political Science',
        faculty: 'Faculty of Social Science',
        durationYears: 4,
        location: 'Zomba',
        minimumRequirements: ["Six credits at MSCE or O' Level including English."],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [{ subject: 'English' }],
        },
        isActive: true,
      },
      {
        id: 'unima-ba-economics',
        name: 'Bachelor of Arts in Economics',
        faculty: 'Faculty of Social Science',
        durationYears: 4,
        location: 'Zomba',
        minimumRequirements: ['Six credits including Mathematics and English Language at MSCE or "O" level.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [{ subject: 'Mathematics' }, { subject: 'English' }],
        },
        isActive: true,
      },
      {
        id: 'unima-bss-law-enforcement',
        name: 'Bachelor of Social Science in Law Enforcement Management and Leadership',
        faculty: 'Faculty of Social Science',
        durationYears: 4,
        location: 'Zomba',
        minimumRequirements: [
          'MSCE, "O" Level or IGCSE with six credits including strong credits in English, Mathematics, Biology and Physical Science/General Science/Chemistry & Physics.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Biology' },
            { subject: 'Physical Science', alternatives: ['General Science', 'Chemistry', 'Physics'] },
          ],
        },
        isActive: true,
      },
    ],
  },

  // ─── MZUNI ───────────────────────────────────────────
  {
    id: 'mzuni',
    name: 'Mzuzu University',
    shortName: 'MZUNI',
    location: 'Mzuzu',
    country: 'MW',
    type: 'PUBLIC',
    programs: [
      {
        id: 'mzuni-hospitality-management',
        name: 'BSc Hospitality Management',
        faculty: 'Department of Hospitality Management',
        durationYears: 4,
        location: 'Luwinga Campus, Mzuzu',
        minimumRequirements: [
          'MSCE or equivalent obtained in not more than two sittings; aggregate of not more than 30 points in best six subjects; at least a credit in English and Mathematics/Additional Mathematics.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [{ subject: 'English' }, { subject: 'Mathematics' }],
        },
        cutOffPoints: 30,
        isActive: true,
      },
      {
        id: 'mzuni-mathematics-statistics',
        name: 'BSc (Hons) Mathematics and Statistics',
        faculty: 'Department of Mathematics and Statistics',
        durationYears: 5,
        location: 'Luwinga Campus, Mzuzu',
        minimumRequirements: [
          'MSCE or equivalent; aggregate of not more than 30 points in the best six subjects; at least six credit passes including English, Mathematics or Additional Mathematics, Biology, Physics and Chemistry.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Biology' },
            { subject: 'Physics' },
            { subject: 'Chemistry' },
          ],
        },
        cutOffPoints: 30,
        isActive: true,
      },
      {
        id: 'mzuni-ict',
        name: 'BSc Information Communication Technology (ICT)',
        faculty: 'Department of Information and Communication Technology',
        durationYears: 4,
        location: 'Luwinga Campus, Mzuzu',
        minimumRequirements: [
          'MSCE or equivalent; aggregate of not more than 30 points in the best six subjects; at least credits in English, Mathematics or Additional Mathematics, Biology, Physics or Chemistry, and two other subjects.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Biology' },
            { subject: 'Physics', alternatives: ['Chemistry'] },
          ],
        },
        cutOffPoints: 30,
        isActive: true,
      },
      {
        id: 'mzuni-data-science',
        name: 'BSc Data Science',
        faculty: 'Department of Information and Communication Technology',
        durationYears: 4,
        location: 'Luwinga Campus, Mzuzu',
        minimumRequirements: [
          'MSCE or equivalent; aggregate of not more than 30 points; at least six credit passes including English, Biology, Mathematics or Additional Mathematics, Physics and Chemistry.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Biology' },
            { subject: 'Mathematics' },
            { subject: 'Physics' },
            { subject: 'Chemistry' },
          ],
        },
        cutOffPoints: 30,
        isActive: true,
      },
      {
        id: 'mzuni-renewable-energy-systems-engineering',
        name: 'BSc (Hons) Renewable Energy Systems Engineering',
        faculty: 'Department of Physics and Electronics',
        durationYears: 5,
        location: 'Luwinga Campus, Mzuzu',
        minimumRequirements: [
          'MSCE or equivalent; aggregate of not more than 30 points in the best six subjects; at least six credit passes including English, Mathematics or Additional Mathematics, Physics, Chemistry, and two other subjects.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Physics' },
            { subject: 'Chemistry' },
          ],
        },
        cutOffPoints: 30,
        isActive: true,
      },
      {
        id: 'mzuni-communication-studies',
        name: 'BA Communication Studies',
        faculty: 'Department of Communication Studies',
        durationYears: 4,
        location: 'Luwinga Campus, Mzuzu',
        minimumRequirements: [
          'MSCE or equivalent; aggregate of not more than 30 points; at least six credit passes including English and any two of: Bible Knowledge, Chichewa, French, Geography, History, Social and Development Studies or Social and Life Skills, Life Skills; plus at least a pass in Mathematics.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics', maxGrade: 8 },
          ],
          groupSubjects: [
            { chooseAtLeast: 2, subjects: ['Bible Knowledge', 'Chichewa', 'French', 'Geography', 'History', 'Social Studies', 'Life Skills'] },
          ],
        },
        cutOffPoints: 30,
        isActive: true,
      },
      {
        id: 'mzuni-town-regional-planning',
        name: 'BSc Town and Regional Planning',
        faculty: 'Department of Land Management',
        durationYears: 4,
        location: 'Luwinga Campus, Mzuzu',
        minimumRequirements: [
          'MSCE or equivalent; aggregate of not more than 30 points in the best six subjects; credit passes in Mathematics, Geography, Agriculture, Social and Development Studies or Social and Life Skills, English, and any other subject.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'Mathematics' },
            { subject: 'Geography' },
            { subject: 'Agriculture' },
            { subject: 'Social Studies', alternatives: ['Life Skills'] },
            { subject: 'English' },
          ],
        },
        cutOffPoints: 30,
        isActive: true,
      },
      {
        id: 'mzuni-biomedical-laboratory-science',
        name: 'BSc (Hons) Biomedical Laboratory Science',
        faculty: 'Department of Biomedical Sciences',
        durationYears: 5,
        location: 'Luwinga Campus, Mzuzu',
        minimumRequirements: [
          'MSCE or equivalent with at least six credit passes, including English, Mathematics, Chemistry, Physics and Biology.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Chemistry' },
            { subject: 'Physics' },
            { subject: 'Biology' },
          ],
        },
        isActive: true,
      },
      {
        id: 'mzuni-nursing-midwifery-generic',
        name: 'BSc Nursing and Midwifery (Generic)',
        faculty: 'Department of Nursing and Midwifery',
        durationYears: 4,
        location: 'Luwinga Campus, Mzuzu',
        minimumRequirements: [
          'Age sixteen (16) and above; MSCE or equivalent with at least six credits in Mathematics, English, Biology, Physics and Chemistry or Physical Science, and any other two subjects.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'Mathematics' },
            { subject: 'English' },
            { subject: 'Biology' },
            { subject: 'Physics' },
            { subject: 'Chemistry', alternatives: ['Physical Science'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'mzuni-water-resources-engineering',
        name: 'BSc Water Resources Engineering and Management',
        faculty: 'Department of Water Resources',
        durationYears: 4,
        location: 'Luwinga Campus, Mzuzu',
        minimumRequirements: [
          'MSCE or equivalent; aggregate of not more than 30 points; strong credits in Mathematics or Additional Mathematics, Physical Science/Physics or Chemistry, English; plus at least credits in any other three subjects.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'Mathematics' },
            { subject: 'Physical Science', alternatives: ['Physics', 'Chemistry'] },
            { subject: 'English' },
          ],
        },
        cutOffPoints: 30,
        isActive: true,
      },
      {
        id: 'mzuni-forestry',
        name: 'BSc Forestry',
        faculty: 'Department of Forestry',
        durationYears: 4,
        location: 'Luwinga Campus, Mzuzu',
        minimumRequirements: [
          'MSCE or equivalent; aggregate of not more than 30 points in the best six subjects; strong credits in science subjects.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [{ subject: 'English' }],
          groupSubjects: [
            { chooseAtLeast: 3, subjects: ['Biology', 'Physics', 'Chemistry', 'Mathematics', 'Agriculture', 'Geography'] },
          ],
        },
        cutOffPoints: 30,
        isActive: true,
      },
      {
        id: 'mzuni-fisheries-aquatic-sciences',
        name: 'BSc Fisheries and Aquatic Sciences',
        faculty: 'Department of Fisheries',
        durationYears: 4,
        location: 'Luwinga Campus, Mzuzu',
        minimumRequirements: [
          'MSCE or equivalent with credit passes in Biology, Physical Science or General Science, Mathematics or Additional Mathematics, English Language, and any two credits from: Geography, Agriculture, Chemistry, Social and Development Studies or Social and Life Skills, Home Economics, Business Studies.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'Biology' },
            { subject: 'Physical Science', alternatives: ['General Science'] },
            { subject: 'Mathematics' },
            { subject: 'English' },
          ],
          groupSubjects: [
            { chooseAtLeast: 2, subjects: ['Geography', 'Agriculture', 'Chemistry', 'Social Studies', 'Life Skills', 'Home Economics', 'Business Studies'] },
          ],
        },
        isActive: true,
      },
    ],
  },

  // ─── LUANAR ──────────────────────────────────────────
  {
    id: 'luanar',
    name: 'Lilongwe University of Agriculture and Natural Resources',
    shortName: 'LUANAR',
    location: 'Lilongwe (NRC / Bunda Campus)',
    country: 'MW',
    type: 'PUBLIC',
    programs: [
      {
        id: 'luanar-environmental-management',
        name: 'Bachelor of Environmental Management',
        faculty: 'Faculty of Life Sciences and Natural Resources',
        durationYears: 4,
        location: 'Lilongwe (NRC / Bunda Campus)',
        minimumRequirements: ['MSCE or equivalent with credits in English, Mathematics, and two Science subjects.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [{ subject: 'English' }, { subject: 'Mathematics' }],
          groupSubjects: [
            { chooseAtLeast: 2, subjects: ['Biology', 'Chemistry', 'Physics', 'Physical Science', 'Agriculture'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'luanar-food-technology',
        name: 'Bachelor of Science in Food Technology',
        faculty: 'Faculty of Life Sciences and Natural Resources',
        durationYears: 4,
        location: 'Lilongwe (NRC / Bunda Campus)',
        minimumRequirements: ['MSCE or equivalent with credit passes in Mathematics, English, and at least two Science subjects, such as Biology, Chemistry, or Physics.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [{ subject: 'Mathematics' }, { subject: 'English' }],
          groupSubjects: [
            { chooseAtLeast: 2, subjects: ['Biology', 'Chemistry', 'Physics'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'luanar-applied-computer-science',
        name: 'Bachelor of Science in Applied Computer Science',
        faculty: 'Faculty of Life Sciences and Natural Resources',
        durationYears: 4,
        location: 'Lilongwe (NRC / Bunda Campus)',
        minimumRequirements: ['MSCE or equivalent with credit passes in English, Mathematics, and at least two Science subjects, such as Biology, Chemistry, or Physics.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [{ subject: 'English' }, { subject: 'Mathematics' }],
          groupSubjects: [
            { chooseAtLeast: 2, subjects: ['Biology', 'Chemistry', 'Physics'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'luanar-textile-fashion-design',
        name: 'Bachelor of Arts in Textile and Fashion Design',
        faculty: 'Faculty of Life Sciences and Natural Resources',
        durationYears: 4,
        location: 'Lilongwe (NRC Campus)',
        minimumRequirements: ['MSCE or equivalent with credit passes in Mathematics, Chemistry, Physics, and Biology.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'Mathematics' },
            { subject: 'Chemistry' },
            { subject: 'Physics' },
            { subject: 'Biology' },
          ],
        },
        isActive: true,
      },
      {
        id: 'luanar-applied-sciences',
        name: 'Bachelor of Science in Applied Sciences',
        faculty: 'Faculty of Life Sciences and Natural Resources',
        durationYears: 4,
        location: 'Lilongwe (NRC / Bunda Campus)',
        minimumRequirements: ['MSCE or equivalent with credit passes in Mathematics, English, Physics, Chemistry (or Physical Science), Biology, and any other subject.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'Mathematics' },
            { subject: 'English' },
            { subject: 'Physics', alternatives: ['Physical Science'] },
            { subject: 'Chemistry', alternatives: ['Physical Science'] },
            { subject: 'Biology' },
          ],
        },
        isActive: true,
      },
      {
        id: 'luanar-agriculture-life-sciences',
        name: 'Bachelor of Science in Agriculture (Life Sciences)',
        faculty: 'Faculty of Life Sciences and Natural Resources',
        durationYears: 4,
        location: 'Lilongwe (NRC / Bunda Campus)',
        minimumRequirements: ['MSCE or equivalent with credit passes in Mathematics, English, and at least two Science subjects such as Biology, Chemistry, or Physics.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [{ subject: 'Mathematics' }, { subject: 'English' }],
          groupSubjects: [
            { chooseAtLeast: 2, subjects: ['Biology', 'Chemistry', 'Physics'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'luanar-agricultural-technology',
        name: 'Bachelor of Agricultural Technology',
        faculty: 'Faculty of Life Sciences and Natural Resources',
        durationYears: 4,
        location: 'Lilongwe (NRC / Bunda Campus)',
        minimumRequirements: ['MSCE or equivalent with credit passes in Mathematics, English, Physics, Chemistry (or Physical Science), Biology, and any other subject.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'Mathematics' },
            { subject: 'English' },
            { subject: 'Physics', alternatives: ['Physical Science'] },
            { subject: 'Chemistry', alternatives: ['Physical Science'] },
            { subject: 'Biology' },
          ],
        },
        isActive: true,
      },
      {
        id: 'luanar-education-science',
        name: 'Bachelor of Education Science',
        faculty: 'Faculty of Life Sciences and Natural Resources',
        durationYears: 4,
        location: 'Lilongwe (NRC / Bunda Campus)',
        minimumRequirements: ['MSCE or equivalent with at least six credit passes including English, Mathematics, Biology and Physical Science or Chemistry and Physics.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Biology' },
            { subject: 'Chemistry', alternatives: ['Physical Science'] },
            { subject: 'Physics', alternatives: ['Physical Science'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'luanar-environmental-science',
        name: 'Bachelor of Science in Environmental Science',
        faculty: 'Faculty of Life Sciences and Natural Resources',
        durationYears: 4,
        location: 'Lilongwe (NRC / Bunda Campus)',
        minimumRequirements: ['MSCE or equivalent with at least six credit passes including English, Mathematics, Biology and Physical Science or Chemistry and Physics.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Biology' },
            { subject: 'Chemistry', alternatives: ['Physical Science'] },
            { subject: 'Physics', alternatives: ['Physical Science'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'luanar-veterinary-medicine',
        name: 'Bachelor of Veterinary Medicine',
        faculty: 'Faculty of Veterinary Medicine',
        durationYears: 6,
        location: 'Lilongwe (NRC / Bunda Campus)',
        minimumRequirements: ['MSCE or equivalent with at least six credit passes including English, Mathematics, Biology and Physical Science or Chemistry and Physics.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Biology' },
            { subject: 'Chemistry', alternatives: ['Physical Science'] },
            { subject: 'Physics', alternatives: ['Physical Science'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'luanar-agricultural-engineering',
        name: 'Bachelor of Science in Agricultural Engineering (Honours)',
        faculty: 'Faculty of Agriculture',
        durationYears: 5,
        location: 'Lilongwe (NRC / Bunda Campus)',
        minimumRequirements: ['MSCE or equivalent with at least six credit passes including English, Mathematics, Biology and Physical Science or Chemistry and Physics.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Biology' },
            { subject: 'Chemistry', alternatives: ['Physical Science'] },
            { subject: 'Physics', alternatives: ['Physical Science'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'luanar-irrigation-engineering',
        name: 'Bachelor of Science in Irrigation Engineering (Honours)',
        faculty: 'Faculty of Agriculture',
        durationYears: 5,
        location: 'Lilongwe (NRC / Bunda Campus)',
        minimumRequirements: ['MSCE or equivalent with at least six credit passes including English, Mathematics, Biology and Physical Science or Chemistry and Physics.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Biology' },
            { subject: 'Chemistry', alternatives: ['Physical Science'] },
            { subject: 'Physics', alternatives: ['Physical Science'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'luanar-environmental-engineering',
        name: 'Bachelor of Science in Environmental Engineering (Honours)',
        faculty: 'Faculty of Agriculture',
        durationYears: 5,
        location: 'Lilongwe (NRC / Bunda Campus)',
        minimumRequirements: ['MSCE or equivalent with at least six credit passes including English, Mathematics, Biology and Physical Science or Chemistry and Physics.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Biology' },
            { subject: 'Chemistry', alternatives: ['Physical Science'] },
            { subject: 'Physics', alternatives: ['Physical Science'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'luanar-animal-science',
        name: 'Bachelor of Science in Animal Science',
        faculty: 'Faculty of Agriculture',
        durationYears: 4,
        location: 'Lilongwe (NRC / Bunda Campus)',
        minimumRequirements: ['MSCE or equivalent with at least six credit passes including English, Mathematics, Biology and Physical Science or Chemistry and Physics.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Biology' },
            { subject: 'Chemistry', alternatives: ['Physical Science'] },
            { subject: 'Physics', alternatives: ['Physical Science'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'luanar-agriculture',
        name: 'Bachelor of Science in Agriculture',
        faculty: 'Faculty of Agriculture',
        durationYears: 4,
        location: 'Lilongwe (NRC / Bunda Campus)',
        minimumRequirements: ['MSCE or equivalent with at least six credit passes including English, Mathematics, Biology and Physical Science or Chemistry and Physics.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Biology' },
            { subject: 'Chemistry', alternatives: ['Physical Science'] },
            { subject: 'Physics', alternatives: ['Physical Science'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'luanar-crop-sciences',
        name: 'Bachelor of Science in Crop Sciences',
        faculty: 'Faculty of Agriculture',
        durationYears: 4,
        location: 'Lilongwe (NRC / Bunda Campus)',
        minimumRequirements: ['MSCE or equivalent with at least six credit passes including English, Mathematics, Biology and Physical Science or Chemistry and Physics.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Biology' },
            { subject: 'Chemistry', alternatives: ['Physical Science'] },
            { subject: 'Physics', alternatives: ['Physical Science'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'luanar-biotechnology',
        name: 'Bachelor of Science in Biotechnology',
        faculty: 'Faculty of Agriculture',
        durationYears: 4,
        location: 'Lilongwe (NRC / Bunda Campus)',
        minimumRequirements: ['MSCE or equivalent with at least six credit passes including English, Mathematics, Biology and Physical Science or Chemistry and Physics.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Biology' },
            { subject: 'Chemistry', alternatives: ['Physical Science'] },
            { subject: 'Physics', alternatives: ['Physical Science'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'luanar-horticultural-sciences',
        name: 'Bachelor of Science in Horticultural Sciences',
        faculty: 'Faculty of Agriculture',
        durationYears: 4,
        location: 'Lilongwe (NRC / Bunda Campus)',
        minimumRequirements: ['MSCE or equivalent with at least six credit passes including English, Mathematics, Biology and Physical Science or Chemistry and Physics.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Biology' },
            { subject: 'Chemistry', alternatives: ['Physical Science'] },
            { subject: 'Physics', alternatives: ['Physical Science'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'luanar-biostatistics',
        name: 'Bachelor of Science in Biostatistics',
        faculty: 'Faculty of Agriculture',
        durationYears: 4,
        location: 'Lilongwe (NRC / Bunda Campus)',
        minimumRequirements: [
          'MSCE with at least 6 credits including English. In addition, a strong credit (1-3 points) in Mathematics.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics', maxGrade: 3 },
          ],
        },
        isActive: true,
      },
      {
        id: 'luanar-agribusiness-management',
        name: 'Bachelor of Science in Agribusiness Management',
        faculty: 'Faculty of Development Studies',
        durationYears: 4,
        location: 'Lilongwe (NRC / Bunda Campus)',
        minimumRequirements: ['MSCE or equivalent with at least six credit passes including English, Mathematics, Biology and Physical Science or Chemistry and Physics.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Biology' },
            { subject: 'Chemistry', alternatives: ['Physical Science'] },
            { subject: 'Physics', alternatives: ['Physical Science'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'luanar-agricultural-economics',
        name: 'Bachelor of Science in Agricultural Economics',
        faculty: 'Faculty of Development Studies',
        durationYears: 4,
        location: 'Lilongwe (NRC / Bunda Campus)',
        minimumRequirements: ['MSCE or equivalent with at least six credit passes including English, Mathematics, Biology and Physical Science or Chemistry and Physics.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Biology' },
            { subject: 'Chemistry', alternatives: ['Physical Science'] },
            { subject: 'Physics', alternatives: ['Physical Science'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'luanar-education-science-devstudies',
        name: 'Bachelor of Science in Education Science',
        faculty: 'Faculty of Development Studies',
        durationYears: 4,
        location: 'Lilongwe (NRC / Bunda Campus)',
        minimumRequirements: ['MSCE or equivalent with at least six credit passes including English, Mathematics, Biology and Physical Science or Chemistry and Physics.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Biology' },
            { subject: 'Chemistry', alternatives: ['Physical Science'] },
            { subject: 'Physics', alternatives: ['Physical Science'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'luanar-communication-journalism',
        name: 'Bachelor of Science in Communication and Journalism',
        faculty: 'Faculty of Development Studies',
        durationYears: 4,
        location: 'Lilongwe (NRC / Bunda Campus)',
        minimumRequirements: ['MSCE or equivalent with at least six credit passes including English, Mathematics, Biology and Physical Science or Chemistry and Physics.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Biology' },
            { subject: 'Chemistry', alternatives: ['Physical Science'] },
            { subject: 'Physics', alternatives: ['Physical Science'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'luanar-agricultural-extension',
        name: 'Bachelor of Science in Agricultural Extension',
        faculty: 'Faculty of Development Studies',
        durationYears: 4,
        location: 'Lilongwe (NRC / Bunda Campus)',
        minimumRequirements: ['MSCE or equivalent with at least six credit passes including English, Mathematics, Biology and Physical Science or Chemistry and Physics.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Biology' },
            { subject: 'Chemistry', alternatives: ['Physical Science'] },
            { subject: 'Physics', alternatives: ['Physical Science'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'luanar-food-science-technology',
        name: 'Bachelor of Science in Food Science and Technology',
        faculty: 'Faculty of Food and Human Sciences',
        durationYears: 4,
        location: 'Lilongwe (NRC / Bunda Campus)',
        minimumRequirements: ['MSCE or equivalent with at least six credit passes including English, Mathematics, Biology and Physical Science or Chemistry and Physics.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Biology' },
            { subject: 'Chemistry', alternatives: ['Physical Science'] },
            { subject: 'Physics', alternatives: ['Physical Science'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'luanar-gender-development',
        name: 'Bachelor of Science in Gender and Development',
        faculty: 'Faculty of Food and Human Sciences',
        durationYears: 4,
        location: 'Lilongwe (NRC / Bunda Campus)',
        minimumRequirements: ['MSCE or equivalent with at least six credit passes including English, Mathematics, Biology and Physical Science or Chemistry.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Biology' },
            { subject: 'Physical Science', alternatives: ['Chemistry'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'luanar-human-sciences-community-services',
        name: 'Bachelor of Human Sciences and Community Services',
        faculty: 'Faculty of Food and Human Sciences',
        durationYears: 4,
        location: 'Lilongwe (NRC / Bunda Campus)',
        minimumRequirements: ['MSCE or equivalent with at least six credit passes including English, Mathematics, Biology and Physical Science or Chemistry.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Biology' },
            { subject: 'Physical Science', alternatives: ['Chemistry'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'luanar-nutrition-food-science',
        name: 'Bachelor of Science in Nutrition and Food Science',
        faculty: 'Faculty of Food and Human Sciences',
        durationYears: 4,
        location: 'Lilongwe (NRC / Bunda Campus)',
        minimumRequirements: ['MSCE or equivalent with at least six credit passes including English, Mathematics, Biology and Physical Science or Chemistry and Physics.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Biology' },
            { subject: 'Chemistry', alternatives: ['Physical Science'] },
            { subject: 'Physics', alternatives: ['Physical Science'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'luanar-aquaculture-fisheries',
        name: 'Bachelor of Science in Aquaculture and Fisheries Science',
        faculty: 'Faculty of Natural Resources',
        durationYears: 4,
        location: 'Lilongwe (NRC / Bunda Campus)',
        minimumRequirements: ['MSCE or equivalent with at least six credit passes including English, Mathematics, Biology and Physical Science or Chemistry and Physics.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Biology' },
            { subject: 'Chemistry', alternatives: ['Physical Science'] },
            { subject: 'Physics', alternatives: ['Physical Science'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'luanar-environmental-sciences-nr',
        name: 'Bachelor of Science in Environmental Sciences',
        faculty: 'Faculty of Natural Resources',
        durationYears: 4,
        location: 'Lilongwe (NRC / Bunda Campus)',
        minimumRequirements: ['MSCE or equivalent with at least six credit passes including English, Mathematics, Biology and Physical Science or Chemistry and Physics.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Biology' },
            { subject: 'Chemistry', alternatives: ['Physical Science'] },
            { subject: 'Physics', alternatives: ['Physical Science'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'luanar-forestry',
        name: 'Bachelor of Science in Forestry',
        faculty: 'Faculty of Natural Resources',
        durationYears: 4,
        location: 'Lilongwe (NRC / Bunda Campus)',
        minimumRequirements: ['MSCE or equivalent with at least six credit passes including English, Mathematics, Biology and Physical Science or Chemistry and Physics.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Biology' },
            { subject: 'Chemistry', alternatives: ['Physical Science'] },
            { subject: 'Physics', alternatives: ['Physical Science'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'luanar-natural-resources-management',
        name: 'Bachelor of Science in Natural Resources Management',
        faculty: 'Faculty of Natural Resources',
        durationYears: 4,
        location: 'Lilongwe (NRC / Bunda Campus)',
        minimumRequirements: ['MSCE or equivalent with at least six credit passes including English, Mathematics, Biology and Physical Science or Chemistry and Physics.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Biology' },
            { subject: 'Chemistry', alternatives: ['Physical Science'] },
            { subject: 'Physics', alternatives: ['Physical Science'] },
          ],
        },
        isActive: true,
      },
    ],
  },

  // ─── KUHeS ───────────────────────────────────────────
  {
    id: 'kuhes',
    name: 'Kamuzu University of Health Sciences',
    shortName: 'KUHeS',
    location: 'Blantyre / Lilongwe',
    country: 'MW',
    type: 'PUBLIC',
    programs: [
      {
        id: 'kuhes-mbbs',
        name: 'Bachelor of Medicine Bachelor of Surgery (MBBS)',
        faculty: 'School of Medicine and Oral Health',
        durationYears: 6,
        location: 'Mahatma Gandhi Campus, Blantyre',
        minimumRequirements: [
          'Regular Entry (PUS): MSCE with 6 credits including English, Biology, Chemistry or Physical Science/General Science, and a third science subject (Physics or Mathematics). Grade of not more than 4 in Biology and Physical Science.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Biology', maxGrade: 4 },
            { subject: 'Chemistry', alternatives: ['Physical Science', 'General Science'], maxGrade: 4 },
          ],
          groupSubjects: [
            { chooseAtLeast: 1, subjects: ['Physics', 'Mathematics'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'kuhes-bds',
        name: 'Bachelor of Dental Surgery (BDS)',
        faculty: 'School of Medicine and Oral Health',
        durationYears: 6,
        location: 'Mahatma Gandhi Campus, Blantyre',
        minimumRequirements: [
          'Regular Entry (PUS): MSCE with 6 credits including English, Biology, Physics and Chemistry/Physical Science. Grade not more than 4 in Biology and Physical Science.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Biology', maxGrade: 4 },
            { subject: 'Physics' },
            { subject: 'Chemistry', alternatives: ['Physical Science'], maxGrade: 4 },
          ],
        },
        isActive: true,
      },
      {
        id: 'kuhes-bpharm',
        name: 'Bachelor of Science in Pharmacy (Honours) (BPharm)',
        faculty: 'School of Life Sciences and Allied Health Professions',
        durationYears: 5,
        location: 'Mahatma Gandhi Campus, Blantyre',
        minimumRequirements: [
          'Regular/EFP Entry: MSCE with 6 credits including English, Biology and Chemistry/Physical Science, and a third science (Physics or Mathematics). Grade not more than 4 in Biology and Chemistry/Physical Science.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Biology', maxGrade: 4 },
            { subject: 'Chemistry', alternatives: ['Physical Science'], maxGrade: 4 },
          ],
          groupSubjects: [
            { chooseAtLeast: 1, subjects: ['Physics', 'Mathematics'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'kuhes-bphys',
        name: 'Bachelor of Physiotherapy (Honours) (BPHYS)',
        faculty: 'School of Life Sciences and Allied Health Professions',
        durationYears: 5,
        location: 'Mahatma Gandhi Campus, Blantyre',
        minimumRequirements: [
          'Regular/EFP Entry: MSCE with 6 credits including Biology, Chemistry/Physical Science and a third science (Physics or Mathematics).',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'Biology' },
            { subject: 'Chemistry', alternatives: ['Physical Science'] },
          ],
          groupSubjects: [
            { chooseAtLeast: 1, subjects: ['Physics', 'Mathematics'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'kuhes-bmls',
        name: 'Bachelor of Medical Laboratory Science (Honours) (BMLS)',
        faculty: 'School of Life Sciences and Allied Health Professions',
        durationYears: 5,
        location: 'Mahatma Gandhi Campus, Blantyre',
        minimumRequirements: [
          'Regular/EFP Entry: MSCE with 6 credits including English, Biology, Chemistry/Physical Science and a third science (Physics or Mathematics). Grade not more than 4 in Biology and Chemistry/Physical Science.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Biology', maxGrade: 4 },
            { subject: 'Chemistry', alternatives: ['Physical Science'], maxGrade: 4 },
          ],
          groupSubjects: [
            { chooseAtLeast: 1, subjects: ['Physics', 'Mathematics'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'kuhes-biomedical-sciences',
        name: 'Bachelor of Science in Biomedical Sciences (Honours)',
        faculty: 'School of Life Sciences and Allied Health Professions',
        durationYears: 5,
        location: 'Mahatma Gandhi Campus, Blantyre',
        minimumRequirements: [
          'Regular Entry (PUS): MSCE with 6 credits including English, Biology, Chemistry and a third science (Mathematics or Physics). Grade C or better required in Biology, Chemistry.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Biology', maxGrade: 6 },
            { subject: 'Chemistry', maxGrade: 6 },
          ],
          groupSubjects: [
            { chooseAtLeast: 1, subjects: ['Mathematics', 'Physics'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'kuhes-bnd',
        name: 'Bachelor of Science in Nutrition and Dietetics (Honours) (BND)',
        faculty: 'School of Life Sciences and Allied Health Professions',
        durationYears: 5,
        location: 'Mahatma Gandhi Campus, Blantyre',
        minimumRequirements: [
          'Regular/EFP Entry: MSCE with 6 credits including English, Biology and Physical Science/Chemistry and Physics.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Biology' },
            { subject: 'Chemistry', alternatives: ['Physical Science'] },
            { subject: 'Physics', alternatives: ['Physical Science'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'kuhes-occupational-therapy',
        name: 'Bachelor of Science in Occupation Therapy',
        faculty: 'School of Life Sciences and Allied Health Professions',
        durationYears: 5,
        location: 'Mahatma Gandhi Campus, Blantyre',
        minimumRequirements: [
          'Regular/EFP Entry: MSCE with 6 credits including English, Biology, Chemistry/Physical Science and a third science. Grade not more than 4 in required subjects.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English', maxGrade: 4 },
            { subject: 'Biology', maxGrade: 4 },
            { subject: 'Chemistry', alternatives: ['Physical Science'], maxGrade: 4 },
          ],
          groupSubjects: [
            { chooseAtLeast: 1, subjects: ['Physics', 'Mathematics'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'kuhes-adult-health-nursing',
        name: 'Bachelor of Science in Adult Health Nursing (BAHN)',
        faculty: 'School of Nursing',
        durationYears: 4,
        location: 'Kameza Campus, Blantyre / Lilongwe Campus',
        minimumRequirements: [
          'Regular/EFP Entry: MSCE with 6 credits including English, Biology, Physical Science/Physics & Chemistry, and Mathematics.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Biology' },
            { subject: 'Physical Science', alternatives: ['Physics', 'Chemistry'] },
            { subject: 'Mathematics' },
          ],
        },
        isActive: true,
      },
      {
        id: 'kuhes-child-health-nursing',
        name: 'Bachelor of Science in Child Health Nursing (BCHI)',
        faculty: 'School of Nursing',
        durationYears: 4,
        location: 'Kameza Campus, Blantyre / Lilongwe Campus',
        minimumRequirements: [
          'Regular/EFP Entry: MSCE with 6 credits including English, Biology, Physical Science/Physics & Chemistry, and Mathematics.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Biology' },
            { subject: 'Physical Science', alternatives: ['Physics', 'Chemistry'] },
            { subject: 'Mathematics' },
          ],
        },
        isActive: true,
      },
      {
        id: 'kuhes-nursing-midwifery',
        name: 'Bachelor of Science in Nursing and Midwifery (BNME)',
        faculty: 'School of Nursing',
        durationYears: 4,
        location: 'Kameza Campus, Blantyre / Lilongwe Campus',
        minimumRequirements: [
          'Regular/EFP Entry: MSCE with 6 credits including English, Biology, Physical Science/Chemistry & Physics, and Mathematics.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Biology' },
            { subject: 'Physical Science', alternatives: ['Chemistry', 'Physics'] },
            { subject: 'Mathematics' },
          ],
        },
        isActive: true,
      },
      {
        id: 'kuhes-community-health-nursing',
        name: 'Bachelor of Science in Community Health Nursing (BCHN)',
        faculty: 'School of Nursing',
        durationYears: 4,
        location: 'Kameza Campus / Lilongwe Campus / Mangochi Satellite',
        minimumRequirements: [
          'Regular/EFP Entry: MSCE with 6 credits including English, Biology, Physical Science/Physics & Chemistry, and Mathematics.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Biology' },
            { subject: 'Physical Science', alternatives: ['Physics', 'Chemistry'] },
            { subject: 'Mathematics' },
          ],
        },
        isActive: true,
      },
      {
        id: 'kuhes-mental-health-nursing',
        name: 'Bachelor of Science in Mental Health and Psychiatric Nursing (BMH)',
        faculty: 'School of Nursing',
        durationYears: 4,
        location: 'Kameza Campus / Lilongwe Campus',
        minimumRequirements: [
          'Regular/EFP Entry: MSCE with 6 credits including English, Biology, Physical Science/Physics & Chemistry, and Mathematics.',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Biology' },
            { subject: 'Physical Science', alternatives: ['Physics', 'Chemistry'] },
            { subject: 'Mathematics' },
          ],
        },
        isActive: true,
      },
    ],
  },

  // ─── DCE ─────────────────────────────────────────────
  {
    id: 'dce',
    name: 'Domasi College of Education',
    shortName: 'DCE',
    location: 'Zomba',
    country: 'MW',
    type: 'PUBLIC',
    programs: [
      {
        id: 'dce-bed-mathematics-biology',
        name: 'Bachelor of Education (Secondary) Mathematics and Biology',
        faculty: 'Faculty of Natural and Applied Sciences',
        durationYears: 4,
        location: 'Zomba',
        minimumRequirements: ['Minimum of credit passes in six subjects, including English/English Language, Chemistry and Physics/Physical Science, Mathematics, and Biology.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Chemistry' },
            { subject: 'Physics', alternatives: ['Physical Science'] },
            { subject: 'Mathematics' },
            { subject: 'Biology' },
          ],
        },
        isActive: true,
      },
      {
        id: 'dce-bed-mathematics-chemistry',
        name: 'Bachelor of Education (Secondary) Mathematics and Chemistry',
        faculty: 'Faculty of Natural and Applied Sciences',
        durationYears: 4,
        location: 'Zomba',
        minimumRequirements: ['Minimum of credit passes in six subjects, including English/English Language, Chemistry and Physics/Physical Science, Biology and Mathematics.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Chemistry' },
            { subject: 'Physics', alternatives: ['Physical Science'] },
            { subject: 'Biology' },
            { subject: 'Mathematics' },
          ],
        },
        isActive: true,
      },
      {
        id: 'dce-bed-mathematics-physics',
        name: 'Bachelor of Education (Secondary) Mathematics and Physics',
        faculty: 'Faculty of Natural and Applied Sciences',
        durationYears: 4,
        location: 'Zomba',
        minimumRequirements: ['Minimum of credit passes in six subjects, including English/English Language, Physics and Chemistry/Physical Science, and Mathematics.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Physics' },
            { subject: 'Chemistry', alternatives: ['Physical Science'] },
            { subject: 'Mathematics' },
          ],
        },
        isActive: true,
      },
      {
        id: 'dce-bed-mathematics-computer-science',
        name: 'Bachelor of Education (Secondary) Mathematics and Computer Science',
        faculty: 'Faculty of Natural and Applied Sciences',
        durationYears: 4,
        location: 'Zomba',
        minimumRequirements: ['Minimum of credit passes in six subjects, including English/English Language, Physics/Physical Science and Mathematics.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Physics', alternatives: ['Physical Science'] },
            { subject: 'Mathematics' },
          ],
        },
        isActive: true,
      },
      {
        id: 'dce-bed-mathematics-agriculture',
        name: 'Bachelor of Education (Secondary) Mathematics and Agriculture',
        faculty: 'Faculty of Natural and Applied Sciences',
        durationYears: 4,
        location: 'Zomba',
        minimumRequirements: ['Minimum of credit passes in six subjects, including English/English Language, Agriculture, Mathematics, and Biology.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Agriculture' },
            { subject: 'Mathematics' },
            { subject: 'Biology' },
          ],
        },
        isActive: true,
      },
      {
        id: 'dce-bed-biology-agriculture',
        name: 'Bachelor of Education (Secondary) Biology and Agriculture',
        faculty: 'Faculty of Natural and Applied Sciences',
        durationYears: 4,
        location: 'Zomba',
        minimumRequirements: ['Minimum of credit passes in six subjects, including English/English Language, Mathematics, Chemistry/Physical Science, Biology, and Agriculture.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Chemistry', alternatives: ['Physical Science'] },
            { subject: 'Biology' },
            { subject: 'Agriculture' },
          ],
        },
        isActive: true,
      },
      {
        id: 'dce-bed-mathematics-human-ecology',
        name: 'Bachelor of Education (Secondary) Mathematics and Human Ecology (Home Economics)',
        faculty: 'Faculty of Natural and Applied Sciences',
        durationYears: 4,
        location: 'Zomba',
        minimumRequirements: ['Minimum of credit passes in six subjects, including English/English Language, Mathematics, and Biology.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Biology' },
          ],
        },
        isActive: true,
      },
      {
        id: 'dce-bed-hps-biology',
        name: 'Bachelor of Education (Secondary) Human Performance Science (Physical Education) and Biology',
        faculty: 'Faculty of Natural and Applied Sciences',
        durationYears: 4,
        location: 'Zomba',
        minimumRequirements: ['Minimum of credit passes in six subjects, including English/English Language, Mathematics, Chemistry/Physical Science and Biology.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Chemistry', alternatives: ['Physical Science'] },
            { subject: 'Biology' },
          ],
        },
        isActive: true,
      },
      {
        id: 'dce-bed-human-ecology-biology',
        name: 'Bachelor of Education (Secondary) Human Ecology (Home Economics) and Biology',
        faculty: 'Faculty of Natural and Applied Sciences',
        durationYears: 4,
        location: 'Zomba',
        minimumRequirements: ['Minimum of credit passes in six subjects, including English/English Language, Chemistry/Physical Science, Mathematics, and Biology.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Chemistry', alternatives: ['Physical Science'] },
            { subject: 'Mathematics' },
            { subject: 'Biology' },
          ],
        },
        isActive: true,
      },
      {
        id: 'dce-bed-human-ecology-agriculture',
        name: 'Bachelor of Education (Secondary) Human Ecology (Home Economics) and Agriculture',
        faculty: 'Faculty of Natural and Applied Sciences',
        durationYears: 4,
        location: 'Zomba',
        minimumRequirements: ['Minimum of credit passes in six subjects, including English/English Language, Mathematics, Agriculture, and Biology.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Agriculture' },
            { subject: 'Biology' },
          ],
        },
        isActive: true,
      },
      {
        id: 'dce-bed-hps-mathematics',
        name: 'Bachelor of Education (Secondary) Human Performance Science (Physical Education) and Mathematics',
        faculty: 'Faculty of Natural and Applied Sciences',
        durationYears: 4,
        location: 'Zomba',
        minimumRequirements: ['Minimum of credit passes in six subjects, including English/English Language, Mathematics and Biology.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Biology' },
          ],
        },
        isActive: true,
      },
      {
        id: 'dce-bed-english-african-languages',
        name: 'Bachelor of Education (Secondary) English and Linguistics and African Languages',
        faculty: 'Faculty of Language, Arts and Communication',
        durationYears: 4,
        location: 'Zomba',
        minimumRequirements: ['Minimum of credit passes in six subjects, including English/English Language and Chichewa.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [{ subject: 'English' }, { subject: 'Chichewa' }],
        },
        isActive: true,
      },
      {
        id: 'dce-bed-english-french',
        name: 'Bachelor of Education (Secondary) English and French',
        faculty: 'Faculty of Language, Arts and Communication',
        durationYears: 4,
        location: 'Zomba',
        minimumRequirements: ['Minimum of credit passes in six subjects, including English/English Language and French.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [{ subject: 'English' }, { subject: 'French' }],
        },
        isActive: true,
      },
      {
        id: 'dce-bed-english-performing-arts',
        name: 'Bachelor of Education (Secondary) English and Performing Arts',
        faculty: 'Faculty of Language, Arts and Communication',
        durationYears: 4,
        location: 'Zomba',
        minimumRequirements: ['Minimum of credit passes in six subjects, including English/English Language and Mathematics.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [{ subject: 'English' }, { subject: 'Mathematics' }],
        },
        isActive: true,
      },
      {
        id: 'dce-bed-english-creative-arts',
        name: 'Bachelor of Education (Secondary) English and Creative Arts',
        faculty: 'Faculty of Language, Arts and Communication',
        durationYears: 4,
        location: 'Zomba',
        minimumRequirements: ['Minimum of credit passes in six subjects, including English/English Language and Mathematics.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [{ subject: 'English' }, { subject: 'Mathematics' }],
        },
        isActive: true,
      },
      {
        id: 'dce-bed-history-geography',
        name: 'Bachelor of Education (Secondary) History and Geography',
        faculty: 'Faculty of Social Sciences',
        durationYears: 4,
        location: 'Zomba',
        minimumRequirements: ['Minimum of credit passes in six subjects, including English/English Language, History, Geography and Mathematics.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'History' },
            { subject: 'Geography' },
            { subject: 'Mathematics' },
          ],
        },
        isActive: true,
      },
      {
        id: 'dce-bed-history-social-studies',
        name: 'Bachelor of Education (Secondary) History and Social Studies',
        faculty: 'Faculty of Social Sciences',
        durationYears: 4,
        location: 'Zomba',
        minimumRequirements: ['Minimum of credit passes in six subjects, including English/English Language, History and Social Studies/Social and Life Skills/Social and Development Studies.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'History' },
            { subject: 'Social Studies', alternatives: ['Life Skills'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'dce-bed-history-religious-studies',
        name: 'Bachelor of Education (Secondary) History and Theology and Religious Studies',
        faculty: 'Faculty of Social Sciences',
        durationYears: 4,
        location: 'Zomba',
        minimumRequirements: ['Minimum of credit passes in six subjects, including English/English Language, History and Bible Knowledge/Religious and Moral Education.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'History' },
            { subject: 'Bible Knowledge', alternatives: ['Religious and Moral Education'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'dce-bed-geography-religious-studies',
        name: 'Bachelor of Education (Secondary) Geography and Theology and Religious Studies',
        faculty: 'Faculty of Social Sciences',
        durationYears: 4,
        location: 'Zomba',
        minimumRequirements: ['Minimum of credit passes in six subjects, including English/English Language, Mathematics, Geography and Bible Knowledge/Religious and Moral Education.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Geography' },
            { subject: 'Bible Knowledge', alternatives: ['Religious and Moral Education'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'dce-bed-geography-social-studies',
        name: 'Bachelor of Education (Secondary) Geography and Social Studies',
        faculty: 'Faculty of Social Sciences',
        durationYears: 4,
        location: 'Zomba',
        minimumRequirements: ['Minimum of credit passes in six subjects, including English/English Language, Mathematics, Geography and Social Studies/Social and Life Skills/Social and Development Studies.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Mathematics' },
            { subject: 'Geography' },
            { subject: 'Social Studies', alternatives: ['Life Skills'] },
          ],
        },
        isActive: true,
      },
      {
        id: 'dce-bed-social-studies-religious-studies',
        name: 'Bachelor of Education (Secondary) Social Studies and Theology and Religious Studies',
        faculty: 'Faculty of Social Sciences',
        durationYears: 4,
        location: 'Zomba',
        minimumRequirements: ['Minimum of credit passes in six subjects, including English, Social Studies and Bible Knowledge/Religious and Moral Education.'],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [
            { subject: 'English' },
            { subject: 'Social Studies' },
            { subject: 'Bible Knowledge', alternatives: ['Religious and Moral Education'] },
          ],
        },
        isActive: true,
      },
    ],
  },

  // ─── MCHS ────────────────────────────────────────────
  // MCHS does not publish per-programme subject combinations publicly; only its
  // General Entry Requirement (6 credits including English) is curated here.
  // Undergraduate DEGREE programmes only; diploma/certificate tracks excluded
  // per the R18 "undergraduate only" scope.
  {
    id: 'mchs',
    name: 'Malawi College of Health Sciences',
    shortName: 'MCHS',
    location: 'Lilongwe / Blantyre / Zomba',
    country: 'MW',
    type: 'PUBLIC',
    programs: [
      {
        id: 'mchs-clinical-medicine',
        name: 'BSc in Clinical Medicine (BSCM)',
        faculty: 'Faculty of Clinical Sciences',
        durationYears: 4,
        location: 'Lilongwe',
        minimumRequirements: [
          'MSCE or equivalent with a minimum of 6 credit passes, including English Language. Specific subject combinations required (see admissions portal).',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [{ subject: 'English' }],
        },
        isActive: true,
      },
      {
        id: 'mchs-clinical-ophthalmology',
        name: 'Bachelor of Clinical Ophthalmology',
        faculty: 'Faculty of Clinical Sciences',
        durationYears: 4,
        location: 'Lilongwe',
        minimumRequirements: [
          'MSCE or equivalent with a minimum of 6 credit passes, including English Language. Specific subject combinations required (see admissions portal).',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [{ subject: 'English' }],
        },
        isActive: true,
      },
      {
        id: 'mchs-nursing-generic',
        name: 'BSc in Nursing (Generic)',
        faculty: 'Faculty of Nursing and Midwifery',
        durationYears: 4,
        location: 'Lilongwe',
        minimumRequirements: [
          'MSCE or equivalent with a minimum of 6 credit passes, including English Language. Specific subject combinations required (see admissions portal).',
        ],
        entryRequirements: {
          minTotalCredits: 6,
          mandatorySubjects: [{ subject: 'English' }],
        },
        isActive: true,
      },
    ],
  },
]

// ─────────────────────────────────────────────────────────
//  LOOKUP HELPERS (the part R16 deferred to R18)
// ─────────────────────────────────────────────────────────

/** Find a university by its catalogue id, or undefined if not present. */
export function findUniversity(id: string): University | undefined {
  return UNIVERSITIES.find((u) => u.id === id)
}

/**
 * Find a programme within a specific university by both ids, or undefined if
 * either the university or the programme is not present in the catalogue.
 */
export function findProgram(
  universityId: string,
  programId: string,
): UniversityProgram | undefined {
  return findUniversity(universityId)?.programs.find((p) => p.id === programId)
}

/**
 * Every programme in the catalogue, flattened and paired with its owning
 * university — the shape the matching engine and cohort UIs iterate over.
 */
export function getAllPrograms(): Array<{ university: University; program: UniversityProgram }> {
  return UNIVERSITIES.flatMap((university) =>
    university.programs.map((program) => ({ university, program })),
  )
}

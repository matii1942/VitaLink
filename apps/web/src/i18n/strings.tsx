/**
 * Every word on screen, in both languages, in one file.
 *
 * The shape is an interface and each language is a value of it, so a missing
 * translation is a type error rather than a blank space somebody finds in
 * production. That is the whole reason this is a typed catalogue and not a
 * pair of plain objects.
 *
 * No internationalisation library. Four screens and two languages is a
 * dictionary and a context; a library would be a dependency to install, a
 * build step to configure and a vocabulary to learn in exchange for a feature
 * nothing here uses — plural rules for Russian, lazy-loaded locales, message
 * compilation. The line to watch is the third language or the first plural
 * rule this cannot express by hand.
 *
 * ---
 *
 * WHAT IS TRANSLATED AND WHAT IS NOT. This is a clinical decision, not a
 * stylistic one, and it has a rule:
 *
 *   Standard NEWS2 vocabulary stays in English. The project's own labels are
 *   translated.
 *
 * So `low`, `medium`, `high`, `low-medium` and `red score` stay as they are —
 * NEWS2 is a Royal College of Physicians standard, and Spanish-speaking
 * hospitals use its terms untranslated, the way they use *shock* and *sepsis*.
 * Rendering `low-medium` as "bajo-medio" would invent vocabulary that nobody
 * says at a handover, and a nurse who knows NEWS2 would have to translate it
 * back.
 *
 * `lower bound`, `scale assumed` and `not scored` are ours — we chose those
 * words — so they are translated.
 *
 * The data is never translated. Diagnoses arrive in Spanish from the hospital
 * and ward codes arrive in English; both are what the source system emits,
 * and rewriting either in the browser would be the client inventing clinical
 * content. Two sentences also arrive from the API — the board's ordering rule
 * and the summary's disclaimer — and they are shown in the server's own words
 * for the same reason: the API sends them precisely so that a consumer does
 * not have to restate them and risk saying something it does not do.
 */
import type { ReactNode } from 'react';

export type Language = 'en' | 'es';

export const LANGUAGES: readonly Language[] = ['en', 'es'];

/** What the switch says, each in its own language. Never translated. */
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: 'English',
  es: 'Español',
};

/**
 * The locale tag each language formats dates and numbers with.
 *
 * The tags carry a region because date order is regional, not linguistic:
 * `en-GB` writes the day before the month and `en-US` does not, and both are
 * English. `es-AR` is the one this hospital would be in.
 *
 * Passing `undefined` to `toLocaleString` would use the browser's own locale
 * instead, which is how a page translated into Spanish ends up with its dates
 * still in English — the reader chose the language, and the formatter never
 * heard about it.
 */
export const LOCALES: Record<Language, string> = {
  en: 'en-GB',
  es: 'es-AR',
};

export interface Strings {
  nav: {
    wards: string;
    patients: string;
    sync: string;
    /** On the switch itself, for a screen reader. */
    language: string;
  };

  masthead: { subtitle: string };

  app: {
    noSuchPage: string;
    demoNotice: (capturedOn: string) => ReactNode;
  };

  /** Shared by more than one screen. */
  common: {
    notRecorded: string;
    never: string;
    unknown: string;
    home: string;
    apiDidNotAnswer: (message: string) => string;
    /** NEWS2's own bands stay English; this one is ours. */
    notScored: string;
    noScore: string;
  };

  wards: {
    lede: ReactNode;
    inBeds: string;
    needAttention: string;
    needAttentionHint: string;
    awaitingIcu: string;
    awaitingIcuHint: string;
    admissionsOnRecord: string;
    admissionsHint: string;
    title: string;
    counts: (open: number, total: number) => string;
    noneInABed: string;
    awaitingIntensiveCare: (count: number) => string;
    bandsTitle: string;
    meaning: {
      high: string;
      medium: string;
      lowMedium: string;
      low: string;
      unscored: string;
    };
    colourNote: string;
    howDataGetsHere: string;
    loading: string;
    empty: string;
  };

  board: {
    allWards: string;
    inABedRead: (open: number, ago: string) => string;
    awaitingCriticalCare: string;
    searchPlaceholder: string;
    searchLabel: string;
    /**
     * The ordering rule comes from the server; this introduces it. It takes
     * and returns a node rather than a string because the rule arrives in
     * English and has to be marked as English inside a Spanish sentence —
     * which is an element, not a substring.
     */
    caption: (shown: number, total: number, orderedBy: ReactNode) => ReactNode;
    columns: {
      news2: string;
      patient: string;
      diagnosis: string;
      lastObserved: string;
      flags: string;
    };
    noMatch: string;
    awaiting: (unit: string) => string;
    redScore: string;
    lowerBound: string;
    scaleAssumed: string;
    loading: string;
    couldNotLoad: (ward: string, message: string) => string;
    noBoard: (ward: string) => string;
  };

  patient: {
    facts: {
      diagnosis: string;
      admitted: string;
      from: string;
      status: string;
      roundsRecorded: string;
    };
    inABed: string;
    dischargedTo: (destination: string) => string;
    awaiting: (unit: string, ago: string) => string;
    couldNotLoad: (id: string, message: string) => string;
    trend: string;
    trendCaption: (rounds: number) => string;
    notEnoughToDraw: string;
    /** In the chart's tooltip: a score exists, but no band was derived. */
    noBand: string;
    observations: string;
    loadingObservations: string;
    noVitalSigns: string;
    roundsCaption: string;
    columns: {
      when: string;
      news2: string;
      resp: string;
      spo2: string;
      support: string;
      systolic: string;
      pulse: string;
      glasgow: string;
      temp: string;
    };
    summary: {
      title: string;
      writing: string;
      unavailable: (message: string) => string;
      nothingWritten: string;
      notRefreshed: (reason: string) => string;
      covers: (through: string) => string;
      unknownRound: string;
      roundsRead: (rounds: number) => string;
    };
  };

  sync: {
    title: string;
    meta: (runs: number) => string;
    lede: string;
    lastRun: string;
    started: (ago: string) => string;
    took: (duration: string) => string;
    tiles: {
      patients: string;
      admissions: string;
      observations: string;
      scored: string;
      rejected: string;
    };
    nothingDropped: string;
    somethingDropped: string;
    twiceTitle: string;
    twiceSame: (observations: number, admissions: number) => ReactNode;
    twiceDifferent: (previous: number, newest: number) => ReactNode;
    earlierRuns: string;
    earlierCaption: (runs: number) => string;
    columns: {
      started: string;
      status: string;
      took: string;
      patients: string;
      admissions: string;
      observations: string;
      rejected: string;
      scored: string;
    };
    rejectedTitle: string;
    rejectedCaption: string;
    rejectedColumns: { when: string; record: string; field: string; reason: string };
    stillRunning: string;
    loading: string;
    couldNotLoad: (message: string) => string;
    empty: string;
  };

  search: {
    title: string;
    meta: string;
    lede: ReactNode;
    placeholder: string;
    label: string;
    searching: string;
    noResults: string;
    nobodyMatches: (query: string) => string;
    found: (total: number) => string;
    showingFirst: (shown: number) => string;
    orderedByName: string;
    columns: { patient: string; mrn: string; where: string; news2: string };
    notInABed: string;
    admitted: (ago: string) => string;
    awaitingCriticalCare: string;
    notMeasured: string;
    didNotAnswer: (message: string) => string;
  };

  /** Units for the relative times. See format.ts. */
  time: {
    justNow: string;
    minutes: (n: number) => string;
    hours: (n: number) => string;
    days: (n: number) => string;
  };

  sex: { male: string; female: string; unknown: string };
}

const en: Strings = {
  nav: { wards: 'Wards', patients: 'Find a patient', sync: 'Synchronisation', language: 'Language' },

  masthead: { subtitle: 'Ward board — synthetic data' },

  app: {
    noSuchPage: 'No such page.',
    demoNotice: (capturedOn) => (
      <>
        <strong>Demo.</strong> Synthetic patients, generated by the simulator in this
        repository — no real clinical data has ever been in this project. The screens are the
        real dashboard, reading responses recorded from the real API on {capturedOn} instead of
        a live one; timestamps are moved forward so the intervals still read correctly. The
        handover notes were written by a language model and each one passed the verifier that
        rejects any figure absent from the record.
      </>
    ),
  },

  common: {
    notRecorded: 'not recorded',
    never: 'never',
    unknown: 'unknown',
    home: 'home',
    apiDidNotAnswer: (message) =>
      `The API did not answer: ${message}. Is it running on port 3000?`,
    notScored: 'not scored',
    noScore: 'no score',
  },

  wards: {
    lede: (
      <>
        A hospital records a patient&rsquo;s breathing, pulse, blood pressure, temperature and
        alertness every few hours. VitaLink reads those rounds out of the hospital&rsquo;s own
        system and turns each one into a single number — <strong>NEWS2</strong>, the national
        early warning score — so that a patient getting worse is visible now, rather than at
        the next shift change.
      </>
    ),
    inBeds: 'patients in a bed',
    needAttention: 'need attention now',
    needAttentionHint: 'high, medium or a single reading at the extreme',
    awaitingIcu: 'waiting for an intensive care bed',
    awaitingIcuHint: 'asked for, not yet given',
    admissionsOnRecord: 'admissions on record',
    admissionsHint: 'open and closed',
    title: 'Wards',
    counts: (open, total) => `${open} in a bed · ${total} in total`,
    noneInABed: 'No patients in a bed right now.',
    awaitingIntensiveCare: (count) => `${count} awaiting intensive care`,
    bandsTitle: 'What the bands mean',
    meaning: {
      high: 'A total of 7 or more. The response is immediate and senior.',
      medium: 'A total of 5 or 6. Urgent review, and the rounds get closer together.',
      lowMedium:
        'A low total, but one single reading at the extreme. This is the patient who looks stable and is not — the reason the rule exists.',
      low: 'A total of 4 or less, with nothing at the extreme. Routine observation.',
      unscored:
        'Nobody has recorded vital signs yet, or the patient is under sixteen, whom this system does not score. Not an absence of risk — an absence of measurement.',
    },
    colourNote:
      'The colour is the third signal and never the only one: every row carries the number and the word as well. Measured against this surface, two of these hues sit closer together than the threshold at which people with full colour vision reliably tell two colours apart — and they are the pair the escalation threshold runs between.',
    howDataGetsHere: 'How the data gets here →',
    loading: 'Loading wards…',
    empty: 'No wards yet. Run a synchronisation first.',
  },

  board: {
    allWards: '← all wards',
    inABedRead: (open, ago) => `${open} in a bed · read ${ago}`,
    awaitingCriticalCare: 'awaiting critical care',
    searchPlaceholder: 'Find a patient by name or MRN',
    searchLabel: 'Find a patient by name or medical record number',
    caption: (shown, total, orderedBy) => (
      <>
        {shown === total
          ? `${total} ${total === 1 ? 'patient' : 'patients'}, `
          : `${shown} of ${total} ${total === 1 ? 'patient' : 'patients'} shown, `}
        {orderedBy}.
      </>
    ),
    columns: {
      news2: 'NEWS2',
      patient: 'Patient',
      diagnosis: 'Diagnosis',
      lastObserved: 'Last observed',
      flags: 'Flags',
    },
    noMatch: 'No patient matches that filter.',
    awaiting: (unit) => `awaiting ${unit}`,
    redScore: 'red score',
    lowerBound: 'lower bound',
    scaleAssumed: 'scale assumed',
    loading: 'Loading the board…',
    couldNotLoad: (ward, message) => `Could not load ${ward}: ${message}`,
    noBoard: (ward) => `No board for ${ward}.`,
  },

  patient: {
    facts: {
      diagnosis: 'Diagnosis',
      admitted: 'Admitted',
      from: 'From',
      status: 'Status',
      roundsRecorded: 'Rounds recorded',
    },
    inABed: 'in a bed',
    dischargedTo: (destination) => `discharged to ${destination}`,
    awaiting: (unit, ago) => `awaiting ${unit} · ${ago}`,
    couldNotLoad: (id, message) => `Could not load admission ${id}: ${message}`,
    trend: 'Trend',
    trendCaption: (rounds) => `NEWS2 across ${rounds} scored rounds, oldest on the left`,
    notEnoughToDraw: 'Not enough scored observations to draw a trend.',
    noBand: 'no band',
    observations: 'Observations',
    loadingObservations: 'Loading observations…',
    noVitalSigns: 'No vital signs have been recorded for this admission.',
    roundsCaption: 'Most recent first. A dash is a measurement that was not taken.',
    columns: {
      when: 'When',
      news2: 'NEWS2',
      resp: 'Resp',
      spo2: 'SpO2',
      support: 'Support',
      systolic: 'Systolic',
      pulse: 'Pulse',
      glasgow: 'Glasgow',
      temp: 'Temp',
    },
    summary: {
      title: 'Handover summary',
      writing: 'Writing…',
      unavailable: (message) => `Unavailable: ${message}`,
      nothingWritten: 'Nothing has been written for this admission.',
      notRefreshed: (reason) => `Not refreshed: ${reason}`,
      covers: (through) => `Covers observations up to ${through}`,
      unknownRound: 'an unknown round',
      roundsRead: (rounds) => `${rounds} rounds read`,
    },
  },

  sync: {
    title: 'Synchronisation',
    meta: (runs) => `every hour, on its own · ${runs} ${runs === 1 ? 'run' : 'runs'} kept`,
    lede: 'VitaLink pulls every admission and every set of vital signs from the hospital’s system, normalises them, and scores each round. It runs on a schedule and nobody watches it. This is what it has been doing.',
    lastRun: 'Last run',
    started: (ago) => `Started ${ago}`,
    took: (duration) => `took ${duration}`,
    tiles: {
      patients: 'Patients',
      admissions: 'Admissions',
      observations: 'Observations',
      scored: 'Scored',
      rejected: 'Rejected',
    },
    nothingDropped: 'Every record the hospital sent was readable. Nothing was dropped.',
    somethingDropped:
      'The records below could not be read. They were counted and kept out, not discarded quietly.',
    twiceTitle: 'Running it twice',
    twiceSame: (observations, admissions) => (
      <>
        The last two runs each took in {observations} observations over {admissions} admissions,
        and the ward did not grow. The synchronisation upserts on the hospital&rsquo;s own
        identifiers, so running it again changes nothing — which is what makes an hourly job
        safe to leave unattended.
      </>
    ),
    twiceDifferent: (previous, newest) => (
      <>
        The last two runs took in different amounts — {previous} then {newest} observations.
        That is expected when new rounds were recorded in between; it would only be a defect if
        the data had not changed.
      </>
    ),
    earlierRuns: 'Earlier runs',
    earlierCaption: (runs) =>
      `Newest first. The last ${runs} ${runs === 1 ? 'run' : 'runs'} the database keeps.`,
    columns: {
      started: 'Started',
      status: 'Status',
      took: 'Took',
      patients: 'Patients',
      admissions: 'Admissions',
      observations: 'Observations',
      rejected: 'Rejected',
      scored: 'Scored',
    },
    rejectedTitle: 'Records that could not be read',
    rejectedCaption:
      'Across the runs shown. Each one was counted and left out of the record rather than guessed at.',
    rejectedColumns: { when: 'When', record: 'Record', field: 'Field', reason: 'Reason' },
    stillRunning: 'still running',
    loading: 'Loading the synchronisation history…',
    couldNotLoad: (message) => `Could not load the runs: ${message}`,
    empty:
      'No synchronisation has run yet. The hourly schedule has not fired and nobody has started one by hand.',
  },

  search: {
    title: 'Find a patient',
    meta: 'across every ward, admitted or not',
    lede: (
      <>
        By family name, given name or medical record number. Accents do not have to match —
        searching <strong>vazquez</strong> finds <strong>VÁZQUEZ</strong>, and the other way
        round.
      </>
    ),
    placeholder: 'Name or MRN',
    label: 'Search by name or medical record number',
    searching: 'Searching…',
    noResults: 'No patients on record yet.',
    nobodyMatches: (query) => `Nobody matches “${query}”.`,
    found: (total) => `${total} ${total === 1 ? 'patient' : 'patients'} found`,
    showingFirst: (shown) => `, showing the first ${shown}`,
    orderedByName: 'Ordered by name.',
    columns: { patient: 'Patient', mrn: 'MRN', where: 'Where', news2: 'NEWS2' },
    notInABed: 'not in a bed',
    admitted: (ago) => `admitted ${ago}`,
    awaitingCriticalCare: 'awaiting critical care',
    notMeasured: 'not measured',
    didNotAnswer: (message) => `The search did not answer: ${message}`,
  },

  time: {
    justNow: 'just now',
    minutes: (n) => `${n} min ago`,
    hours: (n) => `${n} h ago`,
    days: (n) => `${n} d ago`,
  },

  sex: { male: 'M', female: 'F', unknown: '?' },
};

const es: Strings = {
  nav: { wards: 'Salas', patients: 'Buscar paciente', sync: 'Sincronización', language: 'Idioma' },

  masthead: { subtitle: 'Tablero de sala — datos sintéticos' },

  app: {
    noSuchPage: 'No existe esa página.',
    demoNotice: (capturedOn) => (
      <>
        <strong>Demostración.</strong> Pacientes sintéticos, generados por el simulador de este
        repositorio: ningún dato clínico real estuvo nunca en este proyecto. Las pantallas son
        el tablero de verdad, leyendo respuestas grabadas de la API real el {capturedOn} en
        lugar de una en vivo; las marcas de tiempo se desplazan para que los intervalos sigan
        leyéndose bien. Los pases de guardia los escribió un modelo de lenguaje y cada uno pasó
        el verificador que rechaza cualquier cifra ausente del registro.
      </>
    ),
  },

  common: {
    notRecorded: 'sin registrar',
    never: 'nunca',
    unknown: 'sin especificar',
    home: 'domicilio',
    apiDidNotAnswer: (message) =>
      `La API no respondió: ${message}. ¿Está corriendo en el puerto 3000?`,
    /*
     * Two different things, and keeping them apart is ADR 0005's whole point:
     * `notScored` is a decision — this patient is under sixteen, so NEWS2
     * does not apply to them — while `noScore` is an absence, because nobody
     * has recorded the observation yet. The Spanish pair mirrors the English
     * one in exactly that way: a participle for the action not taken, a noun
     * for the thing missing. The first draft of this file had both as "sin
     * puntaje", which would have told a nurse that a clinical decision and a
     * gap in the data are the same state. Matías's call if either word is
     * wrong at the bedside; the distinction is not optional.
     */
    notScored: 'sin puntuar',
    noScore: 'sin puntuación',
  },

  wards: {
    lede: (
      <>
        En un hospital se registran la respiración, el pulso, la presión, la temperatura y el
        estado de conciencia de cada paciente cada pocas horas. VitaLink lee esas rondas del
        sistema del propio hospital y convierte cada una en un solo número —{' '}
        <strong>NEWS2</strong>, el puntaje nacional de alerta temprana — para que un paciente
        que empeora se vea ahora y no en el próximo cambio de turno.
      </>
    ),
    inBeds: 'pacientes internados',
    needAttention: 'necesitan atención ahora',
    needAttentionHint: 'high, medium o un solo parámetro en el extremo',
    awaitingIcu: 'esperando cama de terapia intensiva',
    awaitingIcuHint: 'pedida, todavía no asignada',
    admissionsOnRecord: 'internaciones registradas',
    admissionsHint: 'abiertas y cerradas',
    title: 'Salas',
    counts: (open, total) => `${open} internados · ${total} en total`,
    noneInABed: 'No hay pacientes internados en este momento.',
    awaitingIntensiveCare: (count) => `${count} esperando terapia intensiva`,
    bandsTitle: 'Qué significa cada banda',
    meaning: {
      high: 'Un total de 7 o más. La respuesta es inmediata y de un médico de planta.',
      medium: 'Un total de 5 o 6. Revisión urgente, y las rondas se acercan entre sí.',
      lowMedium:
        'Un total bajo, pero un solo parámetro en el extremo. Es el paciente que parece estable y no lo está: la razón por la que existe la regla.',
      low: 'Un total de 4 o menos, sin nada en el extremo. Observación de rutina.',
      unscored:
        'Todavía nadie registró signos vitales, o el paciente es menor de dieciséis años y este sistema no lo puntúa. No es ausencia de riesgo: es ausencia de medición.',
    },
    colourNote:
      'El color es la tercera señal y nunca la única: cada fila lleva también el número y la palabra. Medidos sobre esta superficie, dos de estos tonos están más cerca entre sí que el umbral a partir del cual una persona con visión normal distingue dos colores con confianza, y son justo el par entre los que corre el umbral de escalamiento.',
    howDataGetsHere: 'Cómo llegan los datos hasta acá →',
    loading: 'Cargando las salas…',
    empty: 'Todavía no hay salas. Corré una sincronización primero.',
  },

  board: {
    allWards: '← todas las salas',
    inABedRead: (open, ago) => `${open} internados · leído ${ago}`,
    awaitingCriticalCare: 'esperando terapia intensiva',
    searchPlaceholder: 'Buscar por nombre o historia clínica',
    searchLabel: 'Buscar un paciente por nombre o número de historia clínica',
    caption: (shown, total, orderedBy) => (
      <>
        {shown === total
          ? `${total} ${total === 1 ? 'paciente' : 'pacientes'} · orden: `
          : `${shown} de ${total} ${total === 1 ? 'paciente' : 'pacientes'} · orden: `}
        {orderedBy}.
      </>
    ),
    columns: {
      news2: 'NEWS2',
      patient: 'Paciente',
      diagnosis: 'Diagnóstico',
      lastObserved: 'Última ronda',
      flags: 'Señales',
    },
    noMatch: 'Ningún paciente coincide con ese filtro.',
    awaiting: (unit) => `esperando ${unit}`,
    redScore: 'red score',
    lowerBound: 'cota inferior',
    scaleAssumed: 'escala asumida',
    loading: 'Cargando el tablero…',
    couldNotLoad: (ward, message) => `No se pudo cargar ${ward}: ${message}`,
    noBoard: (ward) => `No hay tablero para ${ward}.`,
  },

  patient: {
    facts: {
      diagnosis: 'Diagnóstico',
      admitted: 'Ingreso',
      from: 'Desde',
      status: 'Estado',
      roundsRecorded: 'Rondas registradas',
    },
    inABed: 'internado',
    dischargedTo: (destination) => `alta a ${destination}`,
    awaiting: (unit, ago) => `esperando ${unit} · ${ago}`,
    couldNotLoad: (id, message) => `No se pudo cargar la internación ${id}: ${message}`,
    trend: 'Tendencia',
    trendCaption: (rounds) =>
      `NEWS2 a lo largo de ${rounds} rondas puntuadas, la más vieja a la izquierda`,
    notEnoughToDraw: 'No hay suficientes observaciones puntuadas para dibujar una tendencia.',
    noBand: 'sin banda',
    observations: 'Observaciones',
    loadingObservations: 'Cargando observaciones…',
    noVitalSigns: 'No se registraron signos vitales para esta internación.',
    roundsCaption: 'La más reciente primero. Un guion es una medición que no se tomó.',
    columns: {
      when: 'Cuándo',
      news2: 'NEWS2',
      resp: 'Resp',
      spo2: 'SpO2',
      support: 'Soporte',
      systolic: 'Sistólica',
      pulse: 'Pulso',
      glasgow: 'Glasgow',
      temp: 'Temp',
    },
    summary: {
      title: 'Pase de guardia',
      writing: 'Escribiendo…',
      unavailable: (message) => `No disponible: ${message}`,
      nothingWritten: 'No se escribió nada para esta internación.',
      notRefreshed: (reason) => `Sin actualizar: ${reason}`,
      covers: (through) => `Cubre observaciones hasta ${through}`,
      unknownRound: 'una ronda desconocida',
      roundsRead: (rounds) => `${rounds} rondas leídas`,
    },
  },

  sync: {
    title: 'Sincronización',
    meta: (runs) => `cada hora, sola · se guardan ${runs} ${runs === 1 ? 'corrida' : 'corridas'}`,
    lede: 'VitaLink trae cada internación y cada set de signos vitales del sistema del hospital, los normaliza y puntúa cada ronda. Corre sola, en horario, y nadie la mira. Esto es lo que viene haciendo.',
    lastRun: 'Última corrida',
    started: (ago) => `Arrancó ${ago}`,
    took: (duration) => `tardó ${duration}`,
    tiles: {
      patients: 'Pacientes',
      admissions: 'Internaciones',
      observations: 'Observaciones',
      scored: 'Puntuadas',
      rejected: 'Rechazadas',
    },
    nothingDropped: 'Todo lo que mandó el hospital se pudo leer. No se descartó nada.',
    somethingDropped:
      'Los registros de abajo no se pudieron leer. Se contaron y se dejaron afuera; no se descartaron en silencio.',
    twiceTitle: 'Correrla dos veces',
    twiceSame: (observations, admissions) => (
      <>
        Las últimas dos corridas tomaron {observations} observaciones sobre {admissions}{' '}
        internaciones cada una, y la sala no creció. La sincronización hace upsert sobre los
        identificadores del propio hospital, así que volver a correrla no cambia nada: eso es
        lo que hace que un trabajo horario se pueda dejar solo.
      </>
    ),
    twiceDifferent: (previous, newest) => (
      <>
        Las últimas dos corridas tomaron cantidades distintas: {previous} y después {newest}{' '}
        observaciones. Es lo esperable si se registraron rondas nuevas en el medio; sería un
        defecto sólo si los datos no hubieran cambiado.
      </>
    ),
    earlierRuns: 'Corridas anteriores',
    earlierCaption: (runs) =>
      `La más reciente primero. Las últimas ${runs} ${runs === 1 ? 'corrida' : 'corridas'} que guarda la base.`,
    columns: {
      started: 'Arrancó',
      status: 'Estado',
      took: 'Tardó',
      patients: 'Pacientes',
      admissions: 'Internaciones',
      observations: 'Observaciones',
      rejected: 'Rechazadas',
      scored: 'Puntuadas',
    },
    rejectedTitle: 'Registros que no se pudieron leer',
    rejectedCaption:
      'A lo largo de las corridas mostradas. Cada uno se contó y se dejó afuera del registro en vez de adivinarlo.',
    rejectedColumns: { when: 'Cuándo', record: 'Registro', field: 'Campo', reason: 'Motivo' },
    stillRunning: 'todavía corriendo',
    loading: 'Cargando el historial de sincronización…',
    couldNotLoad: (message) => `No se pudieron cargar las corridas: ${message}`,
    empty:
      'Todavía no corrió ninguna sincronización. El horario no se disparó y nadie arrancó una a mano.',
  },

  search: {
    title: 'Buscar un paciente',
    meta: 'en todas las salas, internado o no',
    lede: (
      <>
        Por apellido, nombre o número de historia clínica. Los acentos no tienen que coincidir:
        buscar <strong>vazquez</strong> encuentra <strong>VÁZQUEZ</strong>, y al revés también.
      </>
    ),
    placeholder: 'Nombre o historia clínica',
    label: 'Buscar por nombre o número de historia clínica',
    searching: 'Buscando…',
    noResults: 'Todavía no hay pacientes registrados.',
    nobodyMatches: (query) => `Nadie coincide con «${query}».`,
    found: (total) => `${total} ${total === 1 ? 'paciente encontrado' : 'pacientes encontrados'}`,
    showingFirst: (shown) => `, se muestran los primeros ${shown}`,
    orderedByName: 'Ordenados por apellido.',
    columns: { patient: 'Paciente', mrn: 'Historia', where: 'Dónde', news2: 'NEWS2' },
    notInABed: 'no está internado',
    admitted: (ago) => `ingresó ${ago}`,
    awaitingCriticalCare: 'esperando terapia intensiva',
    notMeasured: 'sin medir',
    didNotAnswer: (message) => `La búsqueda no respondió: ${message}`,
  },

  time: {
    justNow: 'recién',
    minutes: (n) => `hace ${n} min`,
    hours: (n) => `hace ${n} h`,
    days: (n) => `hace ${n} d`,
  },

  sex: { male: 'M', female: 'F', unknown: '?' },
};

export const CATALOGUE: Record<Language, Strings> = { en, es };

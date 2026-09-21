'use strict';

/**
 * The simulated hospital information system.
 *
 * Serves hospital.wsdl over SOAP 1.1 and answers GetPatient, ListAdmissions
 * and GetObservations from an in-memory synthetic dataset. Nothing is
 * persisted: the dataset is rebuilt from the same seed on every start, so
 * every restart serves the same patients (see ADR 0001).
 *
 *   npm start        http://localhost:8080/hospital?wsdl
 */

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const soap = require('soap');

const { generateDataset } = require('./data/generate.js');
const legacy = require('./data/legacy-format.js');

const WSDL_PATH = path.join(__dirname, '..', 'wsdl', 'hospital.wsdl');
const SERVICE_PATH = '/hospital';

/**
 * A SOAP 1.1 Fault. It travels inside the envelope with HTTP 500, which is
 * why a consumer must not treat every 500 from this service as an outage:
 * soap:Client means the request was wrong and retrying will not help.
 */
function clientFault(message) {
  return {
    Fault: {
      faultcode: 'soap:Client',
      faultstring: message,
      statusCode: 500,
    },
  };
}

/**
 * Builds the SOAP service object. Its shape mirrors the WSDL exactly:
 * service name -> port name -> operation name. node-soap matches incoming
 * requests to handlers by those names, so a typo here is a silent 'method
 * not found', not a startup error.
 */
function buildService(dataset) {
  const patientsByMrn = new Map(dataset.patients.map((p) => [p.mrn, p]));
  const admissionsById = new Map(dataset.admissions.map((a) => [a.admissionId, a]));

  const observationsByAdmission = new Map();
  for (const observation of dataset.observations) {
    const list = observationsByAdmission.get(observation.admissionId) ?? [];
    list.push(observation);
    observationsByAdmission.set(observation.admissionId, list);
  }

  return {
    HospitalService: {
      HospitalPort: {
        GetPatient({ mrn }) {
          const patient = patientsByMrn.get(mrn);
          if (!patient) throw clientFault(`Patient not found: ${mrn}`);

          return { patient: legacy.toLegacyPatient(patient) };
        },

        ListAdmissions({ ward, activeOnly }) {
          const onlyActive = activeOnly === 'S';

          const admissions = dataset.admissions
            .filter((a) => !ward || a.ward === ward)
            .filter((a) => !onlyActive || a.dischargedAt === null)
            .map(legacy.toLegacyAdmission);

          return { admissions: { admission: admissions } };
        },

        GetObservations({ admissionId, since }) {
          if (!admissionsById.has(admissionId)) {
            throw clientFault(`Admission not found: ${admissionId}`);
          }

          let sinceDate = null;
          if (since) {
            sinceDate = legacy.fromLegacyDateTime(since);
            if (!sinceDate) {
              throw clientFault(`Invalid date, expected DD/MM/YYYY HH:MM: ${since}`);
            }
          }

          const observations = (observationsByAdmission.get(admissionId) ?? [])
            .filter((o) => !sinceDate || o.recordedAt >= sinceDate)
            .map(legacy.toLegacyObservation);

          return { observations: { observation: observations } };
        },
      },
    },
  };
}

/**
 * Starts the simulator. Exported so tests can start it on a random port
 * (port 0) and shut it down again.
 *
 * @returns {Promise<{ server: http.Server, url: string, dataset: object }>}
 */
function start({ port = 8080, seed = 42, patientCount = 25 } = {}) {
  const dataset = generateDataset({ seed, patientCount });
  const wsdl = fs.readFileSync(WSDL_PATH, 'utf8');

  const server = http.createServer((req, res) => {
    res.statusCode = 404;
    res.end(`Not found. The service lives at ${SERVICE_PATH}?wsdl\n`);
  });

  return new Promise((resolve) => {
    server.listen(port, () => {
      soap.listen(server, SERVICE_PATH, buildService(dataset), wsdl);

      const actualPort = server.address().port;
      resolve({
        server,
        url: `http://localhost:${actualPort}${SERVICE_PATH}`,
        dataset,
      });
    });
  });
}

// Started directly (`npm start`), not required by a test.
if (require.main === module) {
  const port = Number(process.env.LEGACY_SOAP_PORT ?? 8080);

  start({ port }).then(({ url, dataset }) => {
    console.log(`Hospital simulator listening on ${url}`);
    console.log(`  WSDL:          ${url}?wsdl`);
    console.log(
      `  Serving:       ${dataset.patients.length} patients, ` +
        `${dataset.admissions.length} admissions, ` +
        `${dataset.observations.length} observations`,
    );
  });
}

module.exports = { start, buildService };

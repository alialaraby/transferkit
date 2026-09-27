import type { Evidence } from "./index.js";

export interface ProjectComponent {
  id: string;
  name: string;
  kind: "MODULE" | "CONTROLLER" | "SERVICE" | "ENTITY" | "INTEGRATION" | "JOB";
  evidence: Evidence[];
}

export interface ProjectDomain {
  id: string;
  name: string;
  modules: string[];
  controllers: string[];
  services: string[];
  entities: string[];
  integrations: string[];
  jobs: string[];
  evidence: Evidence[];
}

export interface ComponentRelationship {
  id: string;
  kind:
    | "MODULE_IMPORT"
    | "MODULE_PROVIDER"
    | "MODULE_CONTROLLER"
    | "CONTROLLER_SERVICE"
    | "SERVICE_ENTITY"
    | "SERVICE_INTEGRATION"
    | "SERVICE_SERVICE"
    | "JOB_SERVICE";
  from: string;
  to: string;
  evidence: Evidence[];
}

export interface CandidateFlow {
  id: string;
  title: string;
  domainIds: string[];
  componentIds: string[];
  entryPoints: string[];
  integrationIds: string[];
  entityIds: string[];
  jobIds: string[];
  confidence: "DIRECT" | "CANDIDATE";
  sourceFindingIds: string[];
  evidence: Evidence[];
  steps: { componentId: string; evidence: Evidence[] }[];
}

export interface OperationalCapability {
  id: string;
  kind:
    | "SCHEDULED_JOBS"
    | "MESSAGING"
    | "PERSISTENCE"
    | "MIGRATIONS"
    | "DEPLOYMENT"
    | "RUNTIME_CONFIGURATION"
    | "EXTERNAL_SERVICES"
    | "SECURITY"
    | "ADMIN_ENDPOINTS";
  componentIds: string[];
  evidence: Evidence[];
}

export interface ProjectModel {
  domains: ProjectDomain[];
  components: ProjectComponent[];
  relationships: ComponentRelationship[];
  candidateFlows: CandidateFlow[];
  operationalCapabilities: OperationalCapability[];
}

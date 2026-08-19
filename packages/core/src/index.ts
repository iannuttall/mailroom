export { MailroomClient, type MailroomClientOptions } from './api-client.js'
export {
  type AutomationsConfig,
  automationsConfigSchema,
} from './automation.js'
export {
  importCanonicalRequest,
  ingressCanonicalRequest,
  relayCanonicalRequest,
  type SignedImportHeaders,
  type SignedIngressHeaders,
  type SignedRelayHeaders,
  sha256Hex,
  signImportRequest,
  signIngressRequest,
  signRelayRequest,
  verifyBearerToken,
  verifyImportRequest,
  verifyIngressRequest,
  verifyRelayRequest,
} from './crypto.js'
export {
  createMessageSearchDocument,
  headersToRecord,
  messageIdReferences,
  normalizeMessageId,
  normalizeSubject,
  plainTextPreview,
  type SearchDocumentMessage,
} from './email.js'
export {
  isAutomaticReply,
  resolveForwardDestination,
} from './email-routing.js'
export {
  MAILROOM_ERROR_CODES,
  MailroomError,
  type MailroomErrorCode,
  mailroomErrorEnvelope,
  toMailroomError,
} from './errors.js'
export {
  describeOperation,
  getOperationDefinition,
  listOperations,
  MAILROOM_OPERATION_CATEGORIES,
  type MailroomOperationCategory,
  type OperationDefinition,
  type OperationDescription,
  type OperationSummary,
  parseOperationInput,
} from './operations.js'
export {
  AGENT_OUTPUT_MAX_BYTES,
  applyOutputBudget,
  type OutputOmission,
} from './output-budget.js'
export { matchRoute, type RouteMatch, splitEmailAddress } from './routing.js'
export {
  type ApiError,
  type ApiResponse,
  type ApiSuccess,
  apiResponseSchema,
  type DraftStatus,
  directionSchema,
  draftStatusSchema,
  emailAddressSchema,
  idSchema,
  type MessageDirection,
  type MessageStatus,
  type MessageSummary,
  messageStatusSchema,
  messageSummarySchema,
  type OutboundMessage,
  outboundMessageSchema,
  paginationSchema,
  type RouteKind,
  type RouteRecord,
  routeKindSchema,
  routeRecordSchema,
} from './schemas.js'

export const MAILROOM_VERSION = '0.1.0'

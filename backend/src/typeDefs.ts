export const typeDefs = `#graphql
  scalar JSON

  enum PropertyStatus {
    DRAFT
    ACTIVE
    SOLD
    ARCHIVED
  }

  enum FlagState {
    OPEN
    DISMISSED
    CONFIRMED_SCAM
  }

  enum FlagSource {
    AUTO
    MANUAL
  }

  type Agency {
    id: ID!
    name: String!
  }

  type Agent {
    id: ID!
    email: String!
    name: String!
    agency: Agency!
  }

  type Property {
    id: ID!
    title: String!
    description: String!
    address: String!
    city: String!
    zipCode: String!
    country: String!
    type: String!
    price: Float!
    surfaceM2: Float!
    bedrooms: Int!
    bathrooms: Int!
    status: PropertyStatus!
    agentId: ID!
    coListedAgentId: ID
    createdAt: String!
    activatedAt: String
    soldAt: String
    archivedAt: String
    viewCount: Int!
    openFlagCount: Int!
    flags: [PropertyFlag!]!
  }

  type PropertyView {
    id: ID!
    propertyId: ID!
    viewedAt: String!
    viewerEmail: String
    isAnonymous: Boolean!
  }

  type PropertyFlag {
    id: ID!
    propertyId: ID!
    property: Property!
    source: FlagSource!
    ruleCode: String!
    confidence: Int!
    reasons: JSON!
    details: JSON
    state: FlagState!
    reviewReason: String
    createdAt: String!
    reviewedAt: String
  }

  type PropertyStatusCount {
    status: PropertyStatus!
    count: Int!
  }

  type TopViewedProperty {
    property: Property!
    views: Int!
  }

  type DetectionStats {
    totalFlagged: Int!
    autoDetected: Int!
    manuallyReported: Int!
  }

  type DashboardStats {
    statusCounts: [PropertyStatusCount!]!
    totalViewsAllTime: Int!
    totalViewsLast30Days: Int!
    recentSalesCount: Int!
    recentSalesRevenue: Float!
    averageDaysToSell: Float!
    topViewedProperties: [TopViewedProperty!]!
    viewsByDayLast30Days: [DailyViews!]!
  }

  type DailyViews {
    date: String!
    views: Int!
  }

  type PropertyListResult {
    items: [Property!]!
    total: Int!
  }

  input PropertyFiltersInput {
    status: PropertyStatus
    startDate: String
    endDate: String
    page: Int = 1
    pageSize: Int = 20
  }

  input PropertyInput {
    title: String!
    description: String!
    address: String!
    city: String!
    zipCode: String!
    country: String!
    type: String!
    price: Float!
    surfaceM2: Float!
    bedrooms: Int!
    bathrooms: Int!
    status: PropertyStatus!
    coListedAgentId: ID
  }

  type AuthResult {
    token: String!
    agent: Agent!
  }

  type Query {
    me: Agent
    dashboardStats: DashboardStats!
    myProperties(filters: PropertyFiltersInput): PropertyListResult!
    property(id: ID!): Property
    propertyViews(propertyId: ID!, page: Int = 1, pageSize: Int = 25): [PropertyView!]!
    flaggedProperties(page: Int = 1, pageSize: Int = 20): [PropertyFlag!]!
    detectionStats: DetectionStats!
  }

  type Mutation {
    login(email: String!, password: String!): AuthResult!
    createProperty(input: PropertyInput!): Property!
    updateProperty(id: ID!, input: PropertyInput!): Property!
    deleteProperty(id: ID!): Boolean!
    recordPropertyView(propertyId: ID!, viewerEmail: String): Boolean!
    dismissFlag(flagId: ID!, reason: String!): PropertyFlag!
    confirmFlagAsScam(flagId: ID!, reason: String!): PropertyFlag!
  }
`;

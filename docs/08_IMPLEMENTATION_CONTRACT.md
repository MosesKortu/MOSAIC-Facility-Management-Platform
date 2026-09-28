# **MOSAIC — Production-Grade Facility Management System Implementation Prompt**

## **0\. ROLE OF THIS DOCUMENT**

You are implementing **MOSAIC — Management & Operational System for Advanced ICFO Cores**, a production-grade facility management platform for ICFO's:

* NFL — Nano Fabrication Lab  
* NCL — Nanocharacterization Lab  
* SLN — Super-resolution Light Microscopy & Nanoscopy Facility

This is an implementation contract, not a visual prototype brief.

The system must be implemented against the existing MOSAIC source-of-truth documents and the database/API/design decisions already established.

### **Source-of-truth documents**

Before writing or changing code, inspect and reconcile:

1. `00_RESEARCH_SYNTHESIS.md`  
2. `01_PRD.md`  
3. `02_SCHEMA.sql`  
4. `03_API_SPEC.md`  
5. `04_DESIGN_SYSTEM.md`  
6. Existing MOSAIC prototype / shipped frontend  
7. Any existing repository implementation and migration history

### **Source-of-truth precedence**

Use this precedence:

1. Existing production database/schema and migrations  
2. Existing API contract  
3. Current PRD  
4. Existing shipped functionality  
5. Research synthesis  
6. Design system  
7. Prototype/mockup implementation

If two authoritative artifacts conflict:

**STOP and surface the conflict before silently choosing one.**

Do not invent a new domain rule merely because it is convenient to implement.

---

# **1\. PRODUCT PURPOSE**

MOSAIC replaces fragmented core-facility workflows with one system covering:

* equipment discovery  
* equipment booking  
* availability  
* training  
* certification  
* practical certification  
* grant/funding selection  
* cost calculation  
* support services  
* physical equipment access  
* interlock state  
* active sessions  
* maintenance  
* operational monitoring  
* people management  
* internal/external users  
* groups  
* grant allocation  
* analytics  
* revenue reporting  
* auditability

Booking is a validated multi-constraint transaction.

A booking is only valid when the relevant:

* user identity  
* role  
* certification  
* equipment status  
* availability  
* grant/funding  
* support requirements

all pass their respective rules.

---

# **2\. CRITICAL ROLE MODEL**

The existing reference schema currently defines:

standard\_user  
super\_user  
admin

The new business requirement introduces a fourth role:

auditor

This must therefore be treated as an explicit schema/API migration rather than simulated in frontend code.

## **Roles**

### **`standard_user`**

Researcher / PhD / postdoc / approved external researcher.

Can:

* authenticate  
* browse equipment  
* view equipment availability  
* complete training  
* take quizzes  
* request practical certification  
* view own certifications  
* create bookings  
* cancel own eligible bookings  
* select eligible funding  
* view own costs  
* view own grant/funding information  
* operate equipment during authorized sessions  
* view own session history  
* report issues

Cannot:

* manage users  
* manage equipment  
* allocate grants  
* view facility-wide financial analytics  
* view facility-wide people/equipment analytics  
* view audit logs

---

### **`super_user`**

Technician / supervisor / facility operations staff.

Can:

* view operational dashboard  
* manage practical certification queue  
* sign off/reject practical assessments  
* monitor active sessions  
* manage equipment operational status  
* manage maintenance state  
* perform authorized operational overrides  
* perform approved proxy bookings  
* view operational information needed for their facility duties

Cannot:

* manage system-level users/roles  
* allocate grant budgets  
* manage organization/group structure  
* access auditor-only financial/people/equipment analytics  
* access the complete audit log unless explicitly granted by future policy

---

### **`admin`**

Facility/system administrator.

Can:

* manage people  
* manage internal users  
* manage external collaborators  
* manage groups  
* manage group membership  
* manage equipment  
* manage equipment configuration  
* manage equipment pricing  
* manage support tariffs  
* create/manage grants  
* allocate grant budgets to groups  
* manage group funding  
* manage user activation/deactivation  
* manage roles  
* manage system configuration  
* view operational data  
* access administrative audit functionality required for administration

Admin is the **configuration and resource-management role**.

---

### **`auditor`**

Read-only analytics and audit role.

Can:

* access facility-wide analytics  
* view revenue  
* view session statistics  
* view session hours  
* view available hours  
* view utilization  
* view people statistics  
* view equipment statistics  
* view grant allocation/spending statistics  
* view session-level financial detail  
* export approved reports  
* view audit log  
* filter and drill into historical records

Cannot:

* create bookings  
* modify bookings  
* modify users  
* modify equipment  
* allocate grants  
* modify tariffs  
* approve certifications  
* change operational state  
* perform interlock overrides

Auditor is explicitly **read-only**.

Do not expose auditor analytics to `standard_user`, `super_user`, or `admin` unless a later business decision changes this permission model.

---

# **3\. HIGH-LEVEL INFORMATION ARCHITECTURE**

## **Researcher application**

Home  
Equipment  
Calendar  
My Bookings  
Training & Certifications  
Grants & Billing  
Support  
Notifications

## **Super User application**

Operations  
├── Operations Dashboard  
├── Certification Queue  
├── Active Sessions  
├── Equipment Status  
└── Maintenance

## **Admin application**

Administration  
├── Overview  
├── People  
│   ├── Internal  
│   ├── External  
│   └── Groups  
├── Equipment  
├── Grants & Funding  
│   ├── Grants  
│   ├── Group Allocations  
│   └── Spending  
├── Tariffs  
└── Administrative Audit

## **Auditor application**

Analytics  
├── Overview  
├── Sessions  
├── Revenue  
├── People  
├── Equipment  
├── Funding  
└── Audit Log

Do not combine these into one giant dashboard.

Each role has a different job:

Researcher → complete my task  
Super User → resolve today's exceptions  
Admin → manage the facility  
Auditor → understand and verify what happened

---

# **4\. CORE USER FLOW — RESEARCHER**

Login  
 ↓  
Home  
 ↓  
Find Equipment  
 ↓  
Equipment Detail  
 ↓  
Check Access  
 ↓  
 ├── Certified  
 │     ↓  
 │   Availability  
 │  
 └── Not Certified  
       ↓  
     Training  
       ↓  
     SOP  
       ↓  
     Quiz  
       ↓  
     Practical Assessment Request  
       ↓  
     Super User Review  
       ↓  
     Certification  
       ↓  
     Availability  
 ↓  
Select Date / Time  
 ↓  
Select Support  
 ↓  
Calculate Cost  
 ↓  
Select Funding  
 ↓  
Booking Validation  
 ↓  
Review  
 ↓  
Confirm  
 ↓  
Booking Confirmation  
 ↓  
Active Session  
 ↓  
Interlock Authorization  
 ↓  
Equipment Active  
 ↓  
End Session  
 ↓  
Final Session Cost  
 ↓  
Updated Funding Balance

---

# **5\. BOOKING VALIDATION**

Every booking must validate server-side.

Required gates:

1\. authenticated user  
2\. active user  
3\. correct role  
4\. equipment exists  
5\. equipment is operational  
6\. requested time is available  
7\. theoretical certification is valid  
8\. practical certification is signed off  
9\. certification has not expired  
10\. grant is valid  
11\. grant has sufficient available balance  
12\. support tier is valid  
13\. requested duration is valid  
14\. booking does not overlap another active reservation

Booking creation and grant deduction must be transactional.

The UI must map each backend failure to a specific actionable state.

Examples:

CERTIFICATION\_REQUIRED  
PRACTICAL\_CERTIFICATION\_PENDING  
CERTIFICATION\_EXPIRED  
EQUIPMENT\_NOT\_OPERATIONAL  
BOOKING\_CONFLICT  
GRANT\_EXPIRED  
INSUFFICIENT\_GRANT\_BALANCE  
SUPPORT\_UNAVAILABLE

Never show a generic:

> "Booking failed."

when the backend knows the actual reason.

---

# **6\. SESSION COST MODEL**

The authoritative existing model calculates:

Base Cost \=  
equipment.base\_rate\_hourly × booking duration

Support Cost \=  
support\_tariffs.rate\_hourly × booking duration

Total Cost \=  
Base Cost \+ Support Cost

The database already stores:

calculated\_base\_cost  
calculated\_support\_cost  
total\_cost

`total_cost` remains generated from the two component costs.

Do not create a second conflicting cost calculation system.

---

# **7\. KPI AND ANALYTICS MODEL**

Analytics are a first-class product module.

## **Auditor KPI dashboard**

The primary analytics screen must support:

Date range  
Facility  
Equipment  
User type  
Group  
Grant  
Support tier

### **Required KPI cards**

#### **Total Sessions**

Count of relevant sessions/bookings for the selected reporting period according to the documented reporting definition.

#### **Total Session Hours**

Total duration of relevant sessions.

#### **Available Hours**

Available equipment capacity during the selected period.

Available hours must be calculated from the equipment's availability/calendar rules rather than hard-coded.

#### **Utilization**

Utilization \=  
session hours / available equipment hours × 100

The denominator must be clearly defined and consistently applied.

#### **Revenue**

Revenue derived from booking/session financial records.

Do not invent revenue independently from booking costs.

#### **Average Cost per Session**

total revenue / relevant completed sessions

The UI must clearly state the reporting population.

#### **People**

At minimum:

* active users  
* users with sessions  
* internal users  
* external users  
* certified users  
* new users during selected period

#### **Equipment**

At minimum:

* total equipment  
* operational equipment  
* maintenance equipment  
* offline equipment  
* equipment used during period  
* utilization

#### **Funding**

At minimum:

* allocated  
* consumed  
* remaining  
* number of active grants  
* group allocation

---

# **8\. ANALYTICS DRILL-DOWN**

KPI cards are not decorative.

Every meaningful KPI must support drill-down.

Example:

428 Sessions  
     ↓  
Sessions report  
     ↓  
Session table  
     ↓  
Session detail

Session detail must expose:

* booking ID  
* user  
* group  
* internal/external classification  
* equipment  
* facility  
* date/time  
* duration  
* support tier  
* base cost  
* support cost  
* total cost  
* grant  
* session status  
* relevant session events  
* audit references where applicable

---

# **9\. AUDITOR ANALYTICS SCREENS**

## **`/analytics`**

Overview:

Date range  
Facility  
Filters

Total Sessions  
Total Session Hours  
Available Hours  
Utilization  
Revenue  
Average Cost / Session

Usage Trend  
Revenue Trend  
Equipment Utilization  
People Usage  
Funding

## **`/analytics/sessions`**

Table:

Session  
Date  
User  
User Type  
Group  
Facility  
Equipment  
Duration  
Support  
Cost  
Grant  
Status

## **`/analytics/revenue`**

Show:

* total revenue  
* revenue by facility  
* revenue by equipment  
* revenue by support tier  
* revenue by user type  
* revenue by group  
* revenue over time

## **`/analytics/people`**

Show:

* active users  
* internal users  
* external users  
* sessions per user  
* hours per user  
* spending per user  
* group usage

## **`/analytics/equipment`**

Show:

* equipment  
* facility  
* operational state  
* available hours  
* booked/session hours  
* utilization  
* session count  
* revenue  
* maintenance time

## **`/analytics/funding`**

Show:

* grant  
* group  
* allocation  
* consumption  
* remaining  
* expiration  
* utilization

---

# **10\. ADMIN PEOPLE MANAGEMENT**

Admin route:

/admin/people

Top-level tabs:

Internal  
External  
Groups

## **Internal users**

Admin can:

* search  
* filter  
* view  
* activate/deactivate  
* assign role  
* assign group  
* view certifications  
* view funding access  
* view activity

## **External users**

Admin can:

* search  
* view  
* activate/deactivate  
* assign group  
* manage approved facility access  
* view sponsoring/associated internal relationship where supported  
* view certifications  
* view funding access

External users must remain compatible with the existing external collaborator/guest-access design.

Do not duplicate authentication identities merely because the user is external.

---

# **11\. GROUP MANAGEMENT**

Introduce a first-class `groups` concept.

Example:

Nano Electronics Group

12 internal members  
3 external collaborators

Allocated funding:  
€25,000

Consumed:  
€14,820

Remaining:  
€10,180

Admin route:

/admin/groups

Group detail:

Overview  
Members  
Grants  
Spending  
Activity

---

# **12\. GROUP-BASED GRANT ALLOCATION**

The current reference schema has a grant master record associated with a PI.

The new requirement adds group-level budget allocation.

Do not replace the existing grant concept.

Instead introduce a group allocation layer:

Grant  
  │  
  ├── Allocation → Group A  
  ├── Allocation → Group B  
  └── Allocation → Group C

This permits one grant/funding source to be distributed to multiple groups.

A booking consumes from the applicable group allocation.

---

# **13\. AUTHORITATIVE DATABASE SCHEMA**

PostgreSQL 16+.

Existing extensions:

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";  
CREATE EXTENSION IF NOT EXISTS "btree\_gist";

Use UUID primary keys and PostgreSQL-native enums where the reference schema already uses them.

---

## **13.1 User role enum**

Existing:

CREATE TYPE user\_role AS ENUM (  
    'standard\_user',  
    'super\_user',  
    'admin'  
);

### **Required migration**

Add:

ALTER TYPE user\_role ADD VALUE 'auditor';

Do not create a second permission-role mechanism in the frontend.

---

## **13.2 User type enum**

Introduce:

CREATE TYPE user\_type AS ENUM (  
    'internal',  
    'external'  
);

This is different from `user_role`.

Examples:

Internal \+ standard\_user  
Internal \+ super\_user  
Internal \+ admin  
Internal \+ auditor  
External \+ standard\_user

Do not confuse:

internal/external \= identity classification  
standard/super/admin/auditor \= authorization role

---

## **13.3 Users**

Preserve the reference fields:

CREATE TABLE users (  
    user\_id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),  
    sso\_identifier VARCHAR(255) UNIQUE NOT NULL,  
    email VARCHAR(255) UNIQUE NOT NULL,  
    full\_name VARCHAR(255) NOT NULL,  
    avatar\_url TEXT,  
    role user\_role NOT NULL DEFAULT 'standard\_user',  
    is\_active BOOLEAN NOT NULL DEFAULT true,  
    created\_at TIMESTAMPTZ DEFAULT CURRENT\_TIMESTAMP  
);

Extend with:

user\_type user\_type NOT NULL DEFAULT 'internal'

Optional external-user metadata must not be placed into arbitrary JSON unless no structured field is justified.

---

# **14\. GROUPS**

Add:

CREATE TABLE groups (  
    group\_id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),  
    name VARCHAR(255) NOT NULL,  
    description TEXT,  
    is\_active BOOLEAN NOT NULL DEFAULT true,  
    created\_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT\_TIMESTAMP  
);

Recommended uniqueness:

CREATE UNIQUE INDEX groups\_name\_unique\_active  
ON groups (LOWER(name))  
WHERE is\_active \= true;

---

# **15\. GROUP MEMBERSHIPS**

A user may belong to one or more groups if the business rules permit this.

Use a junction table:

CREATE TABLE group\_memberships (  
    group\_id UUID NOT NULL REFERENCES groups(group\_id) ON DELETE CASCADE,  
    user\_id UUID NOT NULL REFERENCES users(user\_id) ON DELETE CASCADE,  
    is\_active BOOLEAN NOT NULL DEFAULT true,  
    joined\_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT\_TIMESTAMP,

    PRIMARY KEY (group\_id, user\_id)  
);

Add indexes:

CREATE INDEX idx\_group\_memberships\_user  
ON group\_memberships(user\_id);

CREATE INDEX idx\_group\_memberships\_group  
ON group\_memberships(group\_id);

---

# **16\. EXTERNAL USER ASSOCIATION**

If external users require an ICFO sponsor/host relationship, model it explicitly rather than encoding it into notes.

Add only if the existing authentication/business requirements confirm this relationship:

CREATE TABLE external\_user\_sponsors (  
    external\_user\_id UUID PRIMARY KEY REFERENCES users(user\_id) ON DELETE CASCADE,  
    sponsor\_user\_id UUID NOT NULL REFERENCES users(user\_id),  
    created\_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT\_TIMESTAMP  
);

Business rule:

external\_user\_id must reference a user where user\_type \= 'external'  
sponsor\_user\_id must reference a user where user\_type \= 'internal'

Enforce this in the service layer and database constraints/triggers where practical.

Do not create this table if the existing external-user requirements explicitly establish another authoritative relationship.

---

# **17\. GRANTS**

Preserve the existing reference structure:

CREATE TABLE grants (  
    grant\_id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),  
    grant\_code VARCHAR(100) UNIQUE NOT NULL,  
    pi\_user\_id UUID NOT NULL REFERENCES users(user\_id),  
    allocated\_budget NUMERIC(12, 2\) NOT NULL,  
    remaining\_balance NUMERIC(12, 2\) NOT NULL,  
    expiration\_date DATE NOT NULL,  
    created\_at TIMESTAMPTZ DEFAULT CURRENT\_TIMESTAMP  
);

Important:

`remaining_balance` must never be changed independently of a transactional funding operation.

All balance-affecting operations must be atomic and auditable.

---

# **18\. GRANT GROUP ALLOCATIONS**

Add:

CREATE TABLE grant\_group\_allocations (  
    allocation\_id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),

    grant\_id UUID NOT NULL  
        REFERENCES grants(grant\_id)  
        ON DELETE CASCADE,

    group\_id UUID NOT NULL  
        REFERENCES groups(group\_id)  
        ON DELETE RESTRICT,

    allocated\_amount NUMERIC(12, 2\) NOT NULL,

    remaining\_balance NUMERIC(12, 2\) NOT NULL,

    created\_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT\_TIMESTAMP,

    UNIQUE (grant\_id, group\_id),

    CHECK (allocated\_amount \>= 0),  
    CHECK (remaining\_balance \>= 0),  
    CHECK (remaining\_balance \<= allocated\_amount)  
);

This table represents:

> “How much of this grant is available to this group?”

It is not a duplicate grant.

---

# **19\. GRANT ALLOCATION RULES**

The service must enforce:

sum(group allocations for a grant)  
    \<= grant.allocated\_budget

A booking using a group allocation must atomically verify:

allocation exists  
allocation is active  
grant is not expired  
allocation has sufficient balance  
user belongs to allocation.group\_id  
user is eligible to use the grant

Then atomically decrement:

grant\_group\_allocations.remaining\_balance

and the appropriate overall grant balance according to the authoritative accounting model.

Do not allow frontend calculations to determine whether money is available.

---

# **20\. BOOKINGS**

Preserve the reference structure:

CREATE TABLE bookings (  
    booking\_id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),

    equipment\_id UUID NOT NULL  
        REFERENCES equipment(equipment\_id),

    user\_id UUID NOT NULL  
        REFERENCES users(user\_id),

    booked\_by\_user\_id UUID NOT NULL  
        REFERENCES users(user\_id),

    grant\_id UUID NOT NULL  
        REFERENCES grants(grant\_id),

    support\_requested support\_tier NOT NULL DEFAULT 'none',

    slot\_range TSTZRANGE NOT NULL,

    status booking\_status NOT NULL DEFAULT 'confirmed',

    calculated\_base\_cost NUMERIC(10, 2\) NOT NULL,

    calculated\_support\_cost NUMERIC(10, 2\) NOT NULL,

    total\_cost NUMERIC(10, 2\)  
        GENERATED ALWAYS AS (  
            calculated\_base\_cost \+ calculated\_support\_cost  
        ) STORED,

    cancelled\_at TIMESTAMPTZ,

    cancelled\_by UUID REFERENCES users(user\_id),

    cancellation\_reason TEXT,

    created\_at TIMESTAMPTZ DEFAULT CURRENT\_TIMESTAMP,

    EXCLUDE USING gist (  
        equipment\_id WITH \=,  
        slot\_range WITH &&  
    )  
    WHERE (status \!= 'cancelled')  
);

### **Required extension**

Add:

allocation\_id UUID  
    REFERENCES grant\_group\_allocations(allocation\_id)

This establishes the exact funding allocation consumed by the booking.

If compatibility requires keeping `grant_id`, retain it.

The service must validate:

bookings.grant\_id  
\==  
grant\_group\_allocations.grant\_id

and:

booking.user\_id  
belongs to  
grant\_group\_allocations.group\_id

---

# **21\. EQUIPMENT**

Preserve the authoritative structure:

CREATE TABLE equipment (  
    equipment\_id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),  
    code VARCHAR(50) UNIQUE NOT NULL,  
    facility facility\_code NOT NULL,  
    name JSONB NOT NULL,  
    description JSONB NOT NULL,  
    base\_rate\_hourly NUMERIC(10, 2\) NOT NULL,  
    buffer\_time\_minutes INT NOT NULL DEFAULT 30,  
    interlock\_ip VARCHAR(45),  
    interlock\_mqtt\_topic VARCHAR(255),  
    status equipment\_status NOT NULL DEFAULT 'operational',  
    created\_at TIMESTAMPTZ DEFAULT CURRENT\_TIMESTAMP  
);

Existing status enum:

CREATE TYPE equipment\_status AS ENUM (  
    'operational',  
    'maintenance',  
    'offline'  
);

Equipment administration must never directly mutate status without producing the corresponding status event.

---

# **22\. SUPPORT TARIFFS**

Preserve:

CREATE TYPE support\_tier AS ENUM (  
    'none',  
    'technician',  
    'supervisor'  
);

and:

CREATE TABLE support\_tariffs (  
    tariff\_id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),  
    tier support\_tier UNIQUE NOT NULL,  
    rate\_hourly NUMERIC(10, 2\) NOT NULL  
);

Admin can manage tariffs.

Every tariff modification must:

* be validated  
* be audit logged  
* not rewrite historical booking costs

Historical bookings must retain their calculated financial values.

---

# **23\. TRAINING**

Preserve:

CREATE TABLE training\_modules (  
    module\_id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),  
    equipment\_id UUID NOT NULL  
        REFERENCES equipment(equipment\_id)  
        ON DELETE CASCADE,  
    sop\_document\_url TEXT NOT NULL,  
    quiz\_schema JSONB NOT NULL,  
    passing\_score INT NOT NULL DEFAULT 80,  
    created\_at TIMESTAMPTZ DEFAULT CURRENT\_TIMESTAMP  
);

---

# **24\. CERTIFICATIONS**

Preserve the reference certification model and practical lifecycle:

not\_requested  
pending  
signed\_off  
rejected

Do not replace the lifecycle with a boolean.

Certification must support:

* theoretical completion  
* quiz score  
* practical request  
* practical review  
* sign-off  
* rejection reason  
* expiration  
* timestamps

Only:

super\_user  
admin

may sign off practical certification.

---

# **25\. EQUIPMENT STATUS EVENTS**

Preserve:

CREATE TABLE equipment\_status\_events (  
    event\_id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),

    equipment\_id UUID NOT NULL  
        REFERENCES equipment(equipment\_id)  
        ON DELETE CASCADE,

    previous\_status equipment\_status NOT NULL,  
    new\_status equipment\_status NOT NULL,

    reason TEXT NOT NULL,

    changed\_by UUID NOT NULL  
        REFERENCES users(user\_id),

    changed\_at TIMESTAMPTZ DEFAULT CURRENT\_TIMESTAMP  
);

This table powers:

* maintenance history  
* offline periods  
* equipment availability analysis  
* auditability  
* utilization calculations

---

# **26\. SESSION EVENTS**

Preserve:

CREATE TYPE session\_event\_state AS ENUM (  
    'authorizing',  
    'active',  
    'fault',  
    'completed'  
);

CREATE TYPE session\_event\_source AS ENUM (  
    'relay',  
    'user',  
    'system'  
);

and:

CREATE TABLE session\_events (  
    event\_id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),

    booking\_id UUID NOT NULL  
        REFERENCES bookings(booking\_id)  
        ON DELETE CASCADE,

    state session\_event\_state NOT NULL,

    source session\_event\_source NOT NULL,

    detail TEXT,

    occurred\_at TIMESTAMPTZ DEFAULT CURRENT\_TIMESTAMP  
);

Session events are the source for physical-session state history.

---

# **27\. AUDIT LOG**

Preserve:

CREATE TABLE audit\_log (  
    log\_id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),

    actor\_user\_id UUID NOT NULL  
        REFERENCES users(user\_id),

    action VARCHAR(100) NOT NULL,

    entity\_type VARCHAR(50) NOT NULL,

    entity\_id UUID NOT NULL,

    before\_state JSONB,

    after\_state JSONB,

    created\_at TIMESTAMPTZ DEFAULT CURRENT\_TIMESTAMP  
);

Audit log must be immutable from application user workflows.

Required events include:

* role changes  
* user activation/deactivation  
* group membership changes  
* grant creation  
* grant allocation  
* grant allocation changes  
* tariff changes  
* equipment changes  
* equipment status changes  
* proxy bookings  
* staff cancellations  
* certification sign-offs  
* certification rejections  
* interlock overrides

Auditor gets read access.

---

# **28\. NOTIFICATIONS**

Preserve the existing notification model.

Notifications must support relevant events such as:

* equipment status changed  
* certification signed off  
* certification rejected  
* booking cancelled by staff  
* grant allocation changed  
* grant approaching exhaustion  
* maintenance affecting booking

Do not introduce email/push infrastructure unless explicitly approved.

---

# **29\. ANALYTICS DATA MODEL**

Do not store dashboard KPI values as mutable counters.

Analytics must be calculated from authoritative transactional data.

For performance, the backend may introduce:

* SQL views  
* materialized views  
* reporting queries  
* pre-aggregated reporting tables

only when justified by measured performance.

Possible reporting views:

reporting\_session\_summary  
reporting\_equipment\_utilization  
reporting\_people\_usage  
reporting\_revenue  
reporting\_group\_funding

These are derived data, not sources of truth.

Never maintain duplicate financial truth in both bookings and analytics tables.

---

# **30\. KPI DEFINITIONS**

Every KPI must have a documented definition.

### **Total Sessions**

Count of sessions/bookings matching the reporting scope.

The UI must specify whether the metric means:

* confirmed bookings  
* completed sessions  
* active \+ completed sessions

Do not mix definitions between screens.

### **Total Session Hours**

Duration derived from booking/session timestamps according to the reporting definition.

### **Available Hours**

Equipment hours that were actually available for use during the selected reporting period.

Maintenance/offline periods must not silently count as available capacity if the reporting definition excludes them.

### **Utilization**

session hours / available hours × 100

### **Revenue**

Sum of relevant `bookings.total_cost`.

Cancelled bookings must follow the documented accounting rule and must not accidentally appear as revenue.

### **Average Cost / Session**

revenue / completed revenue-bearing sessions

### **People**

Derived from `users`, `group_memberships`, and bookings.

### **Equipment**

Derived from `equipment`, `equipment_status_events`, bookings and session events.

---

# **31\. ADMIN PEOPLE UI**

Route:

/admin/people

Tabs:

Internal  
External  
Groups

Components:

PeopleTable  
PeopleFilters  
UserDetailDrawer  
UserStatusControl  
RoleSelector  
GroupMembershipEditor  
CertificationSummary  
FundingSummary

Admin actions must always have:

* confirmation where destructive  
* optimistic UI only when safe  
* server confirmation  
* audit event  
* error recovery

---

# **32\. ADMIN GROUP UI**

Route:

/admin/groups

Components:

GroupTable  
GroupDetail  
GroupMembers  
GrantAllocationTable  
GrantAllocationForm  
GroupSpendingSummary

Group detail:

Group name  
Status  
Internal members  
External members  
Allocated funding  
Consumed funding  
Remaining funding  
Active grants  
Recent activity

---

# **33\. ADMIN GRANTS UI**

Route:

/admin/grants

Tabs:

Grants  
Group Allocations  
Spending

Grant detail:

Grant code  
PI  
Total allocated  
Allocated to groups  
Unallocated  
Consumed  
Remaining  
Expiration

Allocation screen:

Grant  
 ↓  
Select Group  
 ↓  
Enter Allocation  
 ↓  
Validate available amount  
 ↓  
Review  
 ↓  
Confirm  
 ↓  
Audit event

Never permit:

sum allocations \> grant budget

---

# **34\. ADMIN EQUIPMENT UI**

Route:

/admin/equipment

Tabs:

Portfolio  
Maintenance  
Pricing  
History

Equipment detail:

Overview  
Usage  
Availability  
Maintenance  
Pricing  
Audit

Admin can:

* create equipment  
* edit equipment  
* configure pricing  
* change status  
* inspect utilization  
* inspect maintenance history

All changes must be authorized server-side.

---

# **35\. AUDITOR UI**

Route:

/analytics

Navigation:

Analytics Overview  
Sessions  
Revenue  
People  
Equipment  
Funding  
Audit Log

Primary UI components:

KpiCard  
KpiGrid  
DateRangePicker  
FacilityFilter  
FilterBar  
MetricTrend  
ChartCard  
AnalyticsTable  
ColumnSelector  
ExportButton  
DrillDownLink  
AuditTimeline

---

# **36\. RESEARCHER UI COMPONENT SYSTEM**

Core:

EquipmentCard  
EquipmentDetail  
AvailabilityCalendar  
BookingStepper  
BookingGateSummary  
CostBreakdown  
GrantSelector  
CertificationStatus  
TrainingModule  
Quiz  
PracticalAssessment  
BookingReview  
BookingConfirmation  
ActiveSession  
InterlockState  
NotificationCenter

---

# **37\. SUPER USER UI COMPONENT SYSTEM**

OperationsKpi  
ExceptionList  
CertificationQueue  
CertificationReview  
ActiveSessionMonitor  
EquipmentStatusTable  
MaintenanceQueue  
InterlockState  
OperationalTimeline

The Super User dashboard should be exception-first.

Do not turn it into a generic analytics dashboard.

---

# **38\. LOADING / EMPTY / ERROR / PERMISSION STATES**

Every screen must define:

### **Loading**

Use meaningful skeletons for tables/cards.

Never display a blank page.

### **Empty**

Example:

> No external collaborators have been added yet.

Provide the next action where appropriate.

### **Error**

Display:

* what failed  
* whether data may be stale  
* retry action  
* support path when relevant

### **Permission denied**

Example:

> You don't have permission to view facility-wide analytics.

Do not render sensitive KPI values and then disable the buttons.

### **Not found**

Handle deleted/deactivated equipment/users/groups gracefully.

### **Stale data**

Analytics must display the reporting period and, where relevant, the data freshness timestamp.

---

# **39\. API REQUIREMENTS**

Preserve the existing REST \+ WebSocket architecture.

Existing important API areas include:

/auth  
/equipment  
/bookings  
/certifications  
/reports  
/notifications  
/audit-log  
/ws/interlock/:equipment\_id

Add API areas for:

/admin/users  
/admin/groups  
/admin/group-memberships  
/admin/grants  
/admin/grant-allocations  
/admin/equipment  
/analytics

Example:

GET    /analytics/overview  
GET    /analytics/sessions  
GET    /analytics/revenue  
GET    /analytics/people  
GET    /analytics/equipment  
GET    /analytics/funding  
GET    /analytics/export

All analytics endpoints require `auditor`.

Administrative endpoints require `admin`.

Operational endpoints use the appropriate `super_user` / `admin` permissions.

---

# **40\. ANALYTICS API RESPONSE**

Analytics responses should return both values and reporting context.

Example conceptual response:

{  
  "period": {  
    "from": "2026-09-01",  
    "to": "2026-09-30"  
  },  
  "facility": "NFL",  
  "metrics": {  
    "total\_sessions": 428,  
    "session\_hours": 1284.5,  
    "available\_hours": 2040,  
    "utilization\_percent": 62.97,  
    "revenue": 128420.00,  
    "average\_cost\_per\_session": 300.05  
  },  
  "generated\_at": "2026-10-01T08:00:00Z"  
}

Do not hard-code these values in frontend code.

---

# **41\. EXPORTS**

Auditors may export authorized analytics.

Supported formats according to the existing API:

CSV  
JSON

If PDF/HTML reporting remains part of the existing API contract, preserve it.

Exports must use exactly the same filters and KPI definitions as the visible dashboard.

---

# **42\. SECURITY**

Never rely on frontend role checks.

Every protected route must be enforced:

UI  
\+  
API  
\+  
service layer  
\+  
database constraints where appropriate

Examples:

A standard user attempting:

GET /analytics/revenue

must receive a permission error.

An auditor attempting:

POST /admin/grants

must receive a permission error.

An admin attempting to mutate an audit record must be rejected.

---

# **43\. TRANSACTIONS AND CONCURRENCY**

These operations must be atomic:

### **Booking**

validate  
→ reserve equipment  
→ validate funding  
→ decrement funding  
→ create booking  
→ audit

### **Grant allocation**

lock grant  
→ verify unallocated budget  
→ create/update allocation  
→ audit  
→ commit

### **Group membership**

validate user  
→ validate group  
→ create membership  
→ audit

### **Equipment status**

lock equipment  
→ update status  
→ create status event  
→ create notifications if applicable  
→ audit

Never allow race conditions to create:

* double bookings  
* negative balances  
* over-allocation  
* unauthorized access

---

# **44\. DATABASE INDEXING**

At minimum evaluate indexes for:

users.email  
users.sso\_identifier  
users.role  
users.user\_type  
users.is\_active

groups.name

group\_memberships.user\_id  
group\_memberships.group\_id

grants.grant\_code  
grants.pi\_user\_id  
grants.expiration\_date

grant\_group\_allocations.grant\_id  
grant\_group\_allocations.group\_id

equipment.facility  
equipment.status

bookings.equipment\_id  
bookings.user\_id  
bookings.grant\_id  
bookings.allocation\_id  
bookings.slot\_range  
bookings.status  
bookings.created\_at

equipment\_status\_events.equipment\_id  
equipment\_status\_events.changed\_at

session\_events.booking\_id  
session\_events.occurred\_at

audit\_log.actor\_user\_id  
audit\_log.entity\_type  
audit\_log.entity\_id  
audit\_log.created\_at

Use PostgreSQL range/GiST indexing for booking overlap as already defined by the reference schema.

---

# **45\. UI DESIGN SYSTEM**

Follow `04_DESIGN_SYSTEM.md`.

Do not introduce a generic SaaS dashboard aesthetic.

MOSAIC should remain:

* scientific  
* operational  
* calm  
* information-dense but readable  
* state-first  
* accessible

Use the existing:

Pix Blue  
\#032F9B

Pix Yellow  
\#FFCD01

Foreground  
\#333333

Warm Grey  
\#F8F6F1

White

Use semantic colors for:

success  
warning  
error  
information

Do not use color as the only indicator of state.

---

# **46\. ANALYTICS VISUAL DESIGN**

Analytics should not look like a finance-only BI tool.

Use:

* clear KPI cards  
* restrained charts  
* strong typography  
* compact tables  
* facility filters  
* clear units  
* visible reporting periods  
* accessible legends  
* drill-down affordances

Every number needs context:

€128,420  
Revenue · Sep 2026 · All facilities

not simply:

€128,420

---

# **47\. ACCESSIBILITY**

Target WCAG 2.2 AA.

Requirements:

* keyboard navigation  
* visible focus  
* semantic controls  
* accessible tables  
* accessible charts  
* text alternatives for chart information  
* sufficient contrast  
* no color-only state  
* responsive layouts  
* no drag-only interactions  
* accessible dialogs  
* accessible date/time controls

---

# **48\. RESPONSIVE BEHAVIOR**

Desktop is the primary administration/analytics experience.

Mobile must remain usable for:

* researcher booking  
* active session  
* notifications  
* certification  
* operational status

Large analytics tables should provide:

* horizontal scrolling  
* column prioritization  
* responsive detail views

Do not simply shrink desktop tables until they become unusable.

---

# **49\. FRONTEND ARCHITECTURE**

Use:

React  
TypeScript  
Vite  
React Router  
Tailwind  
shadcn/ui  
lucide-react  
TanStack Query  
React Hook Form  
Zod

Organize by domain:

features/  
  auth/  
  equipment/  
  booking/  
  training/  
  certification/  
  sessions/  
  grants/  
  people/  
  groups/  
  administration/  
  operations/  
  analytics/  
  audit/  
  notifications/

Do not create one giant `App.tsx`.

---

# **50\. BACKEND ARCHITECTURE**

Use:

Node.js  
TypeScript  
Fastify  
PostgreSQL 16+  
REST  
WebSockets  
JWT / institutional SSO

Organize:

modules/  
  auth/  
  users/  
  groups/  
  equipment/  
  training/  
  certifications/  
  bookings/  
  grants/  
  sessions/  
  operations/  
  analytics/  
  audit/  
  notifications/

Use:

routes  
controllers  
services  
repositories  
schemas  
authorization

Do not put business logic inside route handlers.

---

# **51\. ANALYTICS SERVICE**

Create a dedicated analytics service.

It owns:

* KPI definitions  
* filters  
* aggregation  
* permissions  
* export  
* reporting freshness  
* drill-down queries

The frontend must never calculate authoritative revenue, utilization, or funding metrics.

---

# **52\. AUDITABILITY**

Every administrative mutation must be traceable.

An audit record must answer:

Who?  
What?  
When?  
Which entity?  
What changed?  
What was the previous state?  
What is the new state?

For example:

Admin  
allocated €10,000  
from grant ICFO-2026  
to Nano Electronics Group  
at 2026-09-25 14:42

---

# **53\. NO FAKE DATA**

Do not hard-code:

€128,420  
428 sessions  
63% utilization  
284 users  
42 instruments

Those are illustrative UI examples only.

Production UI must load actual values from the API.

Development/test fixtures may exist only when isolated from production data paths.

---

# **54\. NO FAKE IMPLEMENTATIONS**

Do not create:

* fake analytics APIs  
* fake permissions  
* fake grant balances  
* fake users  
* fake equipment state  
* fake revenue  
* fake audit logs  
* fake interlock status

If backend functionality does not yet exist:

1. identify it  
2. implement it against the schema/API contract  
3. or explicitly report the blocker

Do not disguise a placeholder as working functionality.

---

# **55\. ROUTE MATRIX**

At minimum:

/login

/  
 /equipment  
 /equipment/:equipmentId  
 /calendar  
 /bookings  
 /bookings/:bookingId  
 /training  
 /training/:moduleId  
 /certifications  
 /grants  
 /support  
 /notifications

/operations  
/operations/certifications  
/operations/sessions  
/operations/equipment  
/operations/maintenance

/admin  
/admin/people  
/admin/people/:userId  
/admin/groups  
/admin/groups/:groupId  
/admin/equipment  
/admin/equipment/:equipmentId  
/admin/grants  
/admin/grants/:grantId  
/admin/grant-allocations  
/admin/tariffs  
/admin/audit

/analytics  
/analytics/sessions  
/analytics/revenue  
/analytics/people  
/analytics/equipment  
/analytics/funding  
/analytics/audit

Every route must have:

* authorization  
* loading state  
* empty state  
* error state  
* not-found state where relevant  
* deep-link support

---

# **56\. ADMIN NAVIGATION**

Admin navigation must never be visible to unauthorized roles.

Administration

Overview  
People  
  Internal  
  External  
  Groups  
Equipment  
Grants & Funding  
Tariffs  
Audit

---

# **57\. AUDITOR NAVIGATION**

Auditor sees:

Analytics

Overview  
Sessions  
Revenue  
People  
Equipment  
Funding  
Audit Log

No mutation actions.

For example, an auditor may see:

Equipment → Oxford RIE → Maintenance history

but must not see:

Change Status  
Edit Equipment

---

# **58\. RESEARCHER NAVIGATION**

Researcher sees only task-relevant functionality:

Home  
Equipment  
Calendar  
My Bookings  
Training  
Grants  
Support

Do not expose facility-wide analytics.

---

# **59\. DEFINITION OF DONE — DATABASE**

The database implementation is complete only when:

* authoritative existing tables remain compatible  
* auditor role is represented correctly  
* internal/external user classification is represented  
* groups exist  
* group memberships exist  
* grant group allocations exist  
* bookings can reference the funding allocation  
* allocation constraints are enforced  
* financial values remain transactional  
* audit events exist  
* required indexes exist  
* migrations are reversible where practical  
* migration tests pass

---

# **60\. DEFINITION OF DONE — ANALYTICS**

Analytics is complete only when:

* KPI definitions are documented  
* API returns real values  
* filters work  
* facility filtering works  
* date ranges work  
* revenue is derived from authoritative booking data  
* sessions are derived from authoritative session/booking data  
* available hours have a documented definition  
* utilization is reproducible  
* people statistics respect internal/external classification  
* equipment statistics respect operational history  
* funding statistics respect grant allocations  
* exports match visible filters  
* auditor permission is enforced server-side

---

# **61\. DEFINITION OF DONE — ADMIN**

Admin is complete only when:

### **People**

* internal users work  
* external users work  
* activation/deactivation works  
* role assignment works  
* group membership works

### **Groups**

* create  
* edit  
* deactivate  
* add/remove members  
* inspect funding

### **Grants**

* create  
* view  
* allocate to group  
* adjust allocation  
* view consumption  
* prevent over-allocation

### **Equipment**

* create/edit  
* status management  
* pricing management  
* maintenance visibility  
* history

Every mutation must be auditable.

---

# **62\. DEFINITION OF DONE — RESEARCHER**

A researcher must be able to complete the complete supported flow:

discover  
→ qualify  
→ book  
→ fund  
→ confirm  
→ access  
→ use  
→ finish  
→ see final cost

without staff intervention when all eligibility gates already pass.

---

# **63\. TESTING**

Minimum test layers:

### **Unit tests**

* cost calculation  
* utilization calculation  
* grant allocation validation  
* permission rules  
* certification rules  
* booking eligibility

### **Integration tests**

* booking transaction  
* grant decrement  
* group allocation  
* equipment status  
* certification sign-off  
* admin mutations  
* analytics queries

### **API tests**

Every documented endpoint.

### **E2E tests**

At minimum:

Researcher booking happy path  
Researcher blocked by certification  
Researcher blocked by funding  
Researcher blocked by equipment maintenance  
Practical certification flow  
Super User sign-off  
Admin adds user  
Admin creates group  
Admin allocates grant  
Auditor views analytics  
Unauthorized user blocked from analytics  
Auditor blocked from mutations

---

# **64\. SECURITY TESTS**

Explicitly test:

* horizontal privilege escalation  
* vertical privilege escalation  
* auditor mutation attempts  
* standard-user analytics access  
* admin access boundaries  
* group funding isolation  
* external user access  
* stale session  
* concurrent booking  
* concurrent funding consumption  
* negative allocation attempts  
* over-allocation  
* audit tampering

---

# **65\. PERFORMANCE**

Analytics must not execute uncontrolled full-table scans on every dashboard load.

Use:

* appropriate indexes  
* efficient aggregation  
* pagination  
* caching where appropriate  
* materialized views only when justified  
* server-side filtering  
* server-side sorting

Large datasets must remain usable.

---

# **66\. OBSERVABILITY**

Production requests should include:

* request/correlation ID  
* structured logging  
* error logging  
* latency measurement  
* database query timing where appropriate

Track operational failures around:

* booking  
* grant allocation  
* interlock  
* certification  
* analytics  
* authentication

Never log secrets or sensitive authentication credentials.

---

# **67\. HEALTH CHECKS**

Implement:

/health  
/ready

Health must distinguish:

application running

from:

database/API dependencies ready

---

# **68\. IMPLEMENTATION ORDER**

Do not implement randomly.

Use this dependency order:

### **Phase 1 — Reconnaissance**

Inspect:

* repository  
* existing migrations  
* existing schema  
* API implementation  
* frontend routes  
* current prototype  
* design system

Produce a source-of-truth conflict report.

### **Phase 2 — Database**

Implement:

1. auditor role  
2. internal/external user type  
3. groups  
4. memberships  
5. grant group allocations  
6. booking allocation relationship  
7. constraints/indexes  
8. migrations

### **Phase 3 — Authorization**

Implement role/permission middleware.

### **Phase 4 — Admin**

Implement:

People  
Groups  
Grants  
Equipment  
Tariffs  
Audit

### **Phase 5 — Analytics**

Implement:

overview  
sessions  
revenue  
people  
equipment  
funding  
audit  
exports

### **Phase 6 — Existing Researcher Flow**

Ensure new funding/group model does not break:

equipment  
→ certification  
→ booking  
→ grant  
→ session

### **Phase 7 — Super User Operations**

Ensure certification, equipment status, maintenance and sessions remain functional.

### **Phase 8 — Integration**

Connect all UI states to real APIs.

### **Phase 9 — Testing**

Run unit, integration, API and E2E tests.

### **Phase 10 — Production Audit**

Compare implementation against:

* PRD  
* schema  
* API specification  
* design system  
* research requirements  
* route matrix  
* permission matrix  
* KPI definitions

---

# **69\. CHANGE CONTROL**

Do not silently alter:

* schema  
* API contract  
* role semantics  
* financial calculations  
* booking rules  
* certification rules  
* audit behavior

If implementation requires a change:

1\. identify requirement  
2\. explain impact  
3\. update schema/API/PRD as appropriate  
4\. create migration  
5\. update tests  
6\. update frontend/backend

Never create frontend fields that have no backend/domain representation merely to make a screen look complete.

---

# **70\. FINAL IMPLEMENTATION PRINCIPLE**

MOSAIC is not:

> a generic SaaS dashboard with equipment cards.

It is a **scientific core-facility management system** where:

people  
   ↓  
groups  
   ↓  
funding  
   ↓  
certification  
   ↓  
equipment  
   ↓  
booking  
   ↓  
physical access  
   ↓  
session  
   ↓  
cost  
   ↓  
analytics  
   ↓  
audit

must remain connected.

The system must preserve the distinction between:

Researcher:  
"Can I use this instrument?"

Super User:  
"What needs attention right now?"

Admin:  
"How do I manage the facility?"

Auditor:  
"What happened, how much did it cost, who used it, and can I verify it?"

The implementation is complete only when these workflows operate on real data, with real authorization, real transactions, real database relationships, real API responses, real error handling, and auditable state changes.

No dead code.

No fake production data.

No hidden TODOs.

No disconnected screens.

No client-only permissions.

No invented financial numbers.

No duplicate sources of financial truth.

Build MOSAIC as a production facility-management platform, not a prototype dressed up as one.


# Test results

Run on the seeded database (`npm run db:reset`, then `npm test` with the production build running on port 3000).

| Suite | Tests | Result |
|---|---|---|
| Database integrity (`tests/db/integrity.test.ts`) | 37 | passed |
| Vector / semantic search (`tests/db/vector.test.ts`) | 12 | passed |
| API end-to-end (`tests/api/api.test.ts`) | 26 | passed |
| **Total** | **75** | **75 passed, 0 failed** |

## Individual test cases

- PASS: tests/db/vector.test.ts › Embeddings storage › every maintenance request has an up-to-date embedding
- PASS: tests/db/vector.test.ts › Embeddings storage › vectors are 384-dimensional and unit length (normalised for cosine)
- PASS: tests/db/vector.test.ts › Embeddings storage › rejects a vector with the wrong dimension
- PASS: tests/db/vector.test.ts › Embeddings storage › query plan uses the HNSW index for nearest-neighbour search
- PASS: tests/db/vector.test.ts › Semantic search finds paraphrases that share no keywords › "lift is not moving" -> LIFT requests
- PASS: tests/db/vector.test.ts › Semantic search finds paraphrases that share no keywords › "insects in the kitchen" -> PEST_CONTROL requests (no shared words with "cockroaches")
- PASS: tests/db/vector.test.ts › Semantic search finds paraphrases that share no keywords › "electricity keeps going off" -> ELECTRICAL requests
- PASS: tests/db/vector.test.ts › Semantic search finds paraphrases that share no keywords › "cupboard door came off" -> CARPENTRY requests
- PASS: tests/db/vector.test.ts › Semantic search finds paraphrases that share no keywords › keyword search alone misses "water dripping from the roof"; vector search finds leak requests
- PASS: tests/db/vector.test.ts › Hybrid search and similar-request lookup › fn_hybrid_search fuses keyword and vector ranks
- PASS: tests/db/vector.test.ts › Hybrid search and similar-request lookup › fn_hybrid_search respects the complex filter
- PASS: tests/db/vector.test.ts › Hybrid search and similar-request lookup › fn_similar_requests returns neighbours in descending similarity, excluding itself
- PASS: tests/db/integrity.test.ts › Domains and CHECK constraints › rejects a malformed email (email_address domain)
- PASS: tests/db/integrity.test.ts › Domains and CHECK constraints › rejects a phone number that is not a 10-digit Indian mobile
- PASS: tests/db/integrity.test.ts › Domains and CHECK constraints › refuses to store a plain-text password
- PASS: tests/db/integrity.test.ts › Domains and CHECK constraints › treats emails case-insensitively for uniqueness
- PASS: tests/db/integrity.test.ts › Domains and CHECK constraints › rejects negative money values (money_inr domain)
- PASS: tests/db/integrity.test.ts › Domains and CHECK constraints › rejects an invalid vehicle registration number
- PASS: tests/db/integrity.test.ts › Structural triggers › blocks a unit on a floor its block does not have
- PASS: tests/db/integrity.test.ts › Structural triggers › only lets TENANT users have a tenant profile
- PASS: tests/db/integrity.test.ts › Structural triggers › keeps joint ownership shares at or below 100%
- PASS: tests/db/integrity.test.ts › Leases › marks the unit LEASED when an active lease is created
- PASS: tests/db/integrity.test.ts › Leases › rejects overlapping live leases on the same unit (EXCLUDE constraint)
- PASS: tests/db/integrity.test.ts › Leases › caps the deposit at ten months of rent
- PASS: tests/db/integrity.test.ts › Leases › refuses to lease a unit that has no owner
- PASS: tests/db/integrity.test.ts › Leases › sp_terminate_lease closes the lease, voids later rent, releases parking and frees the unit
- PASS: tests/db/integrity.test.ts › Leases › sp_terminate_lease rejects a date outside the lease period
- PASS: tests/db/integrity.test.ts › Billing › fn_generate_monthly_invoices is idempotent
- PASS: tests/db/integrity.test.ts › Billing › refuses to bill a future month
- PASS: tests/db/integrity.test.ts › Billing › prorates rent for a lease that starts mid-month
- PASS: tests/db/integrity.test.ts › Billing › tracks partial and full payments through the payment trigger
- PASS: tests/db/integrity.test.ts › Billing › rejects overpayment
- PASS: tests/db/integrity.test.ts › Billing › rejects payments on a void invoice
- PASS: tests/db/integrity.test.ts › Billing › makes payments immutable and recalculates the invoice when one is deleted
- PASS: tests/db/integrity.test.ts › Billing › will not void an invoice that has payments
- PASS: tests/db/integrity.test.ts › Billing › applies at most one late fee per overdue invoice, minimum Rs 100
- PASS: tests/db/integrity.test.ts › Parking rules › does not let a bike take a car slot, or a petrol car an EV slot
- PASS: tests/db/integrity.test.ts › Parking rules › does not allocate a slot from a different complex
- PASS: tests/db/integrity.test.ts › Parking rules › blocks double-booking a slot (EXCLUDE constraint)
- PASS: tests/db/integrity.test.ts › Parking rules › rejects a vehicle whose owner does not live in the unit
- PASS: tests/db/integrity.test.ts › Maintenance workflow › rejects an illegal status jump (OPEN -> RESOLVED)
- PASS: tests/db/integrity.test.ts › Maintenance workflow › requires a vendor before a request can be assigned
- PASS: tests/db/integrity.test.ts › Maintenance workflow › stamps timestamps and writes history for every transition
- PASS: tests/db/integrity.test.ts › Maintenance workflow › refuses a request from someone unconnected to the unit
- PASS: tests/db/integrity.test.ts › Maintenance workflow › drops the stored embedding when the request text changes
- PASS: tests/db/integrity.test.ts › Audit trail › records who changed a lease, and never copies password hashes
- PASS: tests/db/integrity.test.ts › Views and materialized view › v_complex_occupancy categories add up to the unit count
- PASS: tests/db/integrity.test.ts › Views and materialized view › v_invoice_balance balance equals amount minus paid
- PASS: tests/db/integrity.test.ts › Views and materialized view › mv_complex_kpis can be refreshed concurrently
- PASS: tests/api/api.test.ts › Authentication › rejects a wrong password with 401
- PASS: tests/api/api.test.ts › Authentication › issues an HttpOnly, SameSite session cookie
- PASS: tests/api/api.test.ts › Authentication › requires a session for API calls
- PASS: tests/api/api.test.ts › Authentication › rejects a forged token
- PASS: tests/api/api.test.ts › Authentication › redirects page requests without a session to /login
- PASS: tests/api/api.test.ts › Role-based access › tenants cannot open staff-only endpoints
- PASS: tests/api/api.test.ts › Role-based access › managers cannot run admin-only actions
- PASS: tests/api/api.test.ts › Role-based access › a manager only sees the complexes assigned to them
- PASS: tests/api/api.test.ts › Role-based access › a tenant only sees invoices billed to them
- PASS: tests/api/api.test.ts › Role-based access › a tenant cannot view another unit
- PASS: tests/api/api.test.ts › Role-based access › an owner sees only units they own
- PASS: tests/api/api.test.ts › Validation and security › returns 400 with a readable message for invalid input
- PASS: tests/api/api.test.ts › Validation and security › rejects state-changing requests that are not JSON (CSRF defence)
- PASS: tests/api/api.test.ts › Validation and security › treats SQL in search parameters as data
- PASS: tests/api/api.test.ts › Validation and security › surfaces database constraint violations as 409/422 with the rule explained
- PASS: tests/api/api.test.ts › Billing flow › a tenant pays part of an invoice, then the rest
- PASS: tests/api/api.test.ts › Billing flow › a tenant cannot pay someone else's invoice, or pay in cash
- PASS: tests/api/api.test.ts › Billing flow › the admin billing run is idempotent
- PASS: tests/api/api.test.ts › Billing flow › an admin can reverse a payment and the invoice reopens
- PASS: tests/api/api.test.ts › Maintenance flow with semantic search › a tenant raises a request; it is stored together with its embedding
- PASS: tests/api/api.test.ts › Maintenance flow with semantic search › staff can find it with a paraphrase that shares almost no words
- PASS: tests/api/api.test.ts › Maintenance flow with semantic search › staff move it through the workflow and residents rate it
- PASS: tests/api/api.test.ts › Maintenance flow with semantic search › an illegal transition is refused by the database trigger (422)
- PASS: tests/api/api.test.ts › Maintenance flow with semantic search › hybrid search reports both keyword and vector ranks
- PASS: tests/api/api.test.ts › Leases › a manager creates a lease on a vacant unit and the unit becomes LEASED
- PASS: tests/api/api.test.ts › Reports › every report runs and returns its SQL

#!/usr/bin/env node
// Operator tool (SEED-059): prints ONE signed JWT to stdout and nothing else.
//   XTIMATOR_DATA_JWT_SECRET=<secret> node scripts/sign-data-jwt.mjs anon      (no expiry)
//   XTIMATOR_DATA_JWT_SECRET=<secret> node scripts/sign-data-jwt.mjs service   (1 hour)
// The secret is read from the environment only; the app never runs or logs this.
import { SignJWT } from 'jose'

const kind = process.argv[2]
const secret = process.env.XTIMATOR_DATA_JWT_SECRET
if (kind !== 'anon' && kind !== 'service') {
  console.error('usage: node scripts/sign-data-jwt.mjs <anon|service>')
  process.exit(2)
}
if (!secret || Buffer.byteLength(secret) < 32) {
  console.error('XTIMATOR_DATA_JWT_SECRET must be set (at least 32 bytes)')
  process.exit(2)
}

const jwt = new SignJWT({ role: kind === 'anon' ? 'anon' : 'service_role', iss: 'xtimator' })
  .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
  .setIssuedAt()
if (kind === 'service') jwt.setExpirationTime('1h')
console.log(await jwt.sign(new TextEncoder().encode(secret)))

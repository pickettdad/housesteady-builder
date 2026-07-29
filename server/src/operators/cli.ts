/**
 * Managing operators from the command line.
 *
 * Without this the system is unusable on a fresh database: every write path
 * needs an operator and nothing can create the first one. It is deliberately
 * small — add, list, retire, restore — and it is not an admin tool. There is no
 * password to set because there is nothing to log in to.
 *
 *   npm run operator -- list
 *   npm run operator -- add "David Pickett" dp
 *   npm run operator -- retire dp
 *   npm run operator -- restore dp
 */

import { openDb } from '../db/index.js'
import {
  createOperator, deactivateOperator, listOperators, OperatorRefused, reactivateOperator, resolveOperator,
} from './registry.js'

const [command, ...rest] = process.argv.slice(2)

const usage = (): never => {
  console.log(
    'Operators — who did what. Not a login.\n\n' +
      '  list                       every operator, active first\n' +
      '  add "Full Name" <code>     register somebody\n' +
      '  retire <code>              stop them taking new work; their records keep their name\n' +
      '  restore <code>             bring somebody back\n\n' +
      'The current operator is set with HOUSESTEADY_OPERATOR=<code>.\n' +
      'With exactly one active operator it can be left unset.',
  )
  process.exit(command ? 1 : 0)
}

const db = openDb()

const show = (): void => {
  const all = listOperators(db, { includeInactive: true })
  if (all.length === 0) return console.log('No operators yet. Add one:  npm run operator -- add "Full Name" <code>')
  const width = Math.max(...all.map((o) => o.display_name.length))
  for (const o of all) {
    const state = o.active ? 'active' : `retired ${(o.deactivated_at ?? '').slice(0, 10)}`
    console.log(`  ${o.display_name.padEnd(width)}  ${o.short_code.padEnd(10)}  ${state}`)
  }
}

try {
  switch (command) {
    case 'list':
      show()
      break

    case 'add': {
      const [displayName, shortCode] = rest
      if (!displayName || !shortCode) usage()
      const operator = createOperator(db, { displayName: displayName!, shortCode: shortCode! })
      // The display name is echoed because it is what a client will read on
      // every report this person's work reaches — worth seeing once, in the
      // form it will appear, rather than discovering it in a rendered binder.
      console.log(`Added ${operator.display_name} (${operator.short_code}).`)
      console.log(`Reports of their visits will say: visited by ${operator.display_name}`)
      break
    }

    case 'retire': {
      const [who] = rest
      if (!who) usage()
      const operator = deactivateOperator(db, resolveOperator(db, who!).id)
      console.log(
        `${operator.display_name} is retired. Nothing was deleted — every record they made keeps their name.`,
      )
      break
    }

    case 'restore': {
      const [who] = rest
      if (!who) usage()
      console.log(`${reactivateOperator(db, resolveOperator(db, who!).id).display_name} is active again.`)
      break
    }

    default:
      usage()
  }
} catch (e) {
  if (e instanceof OperatorRefused) {
    console.error(e.message)
    process.exit(1)
  }
  throw e
}

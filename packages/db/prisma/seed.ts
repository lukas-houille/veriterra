import { admin } from '../src/client';
import { seed } from './seed-data';

seed()
  .then(() => {
    console.log('Seed complete: orgs A & B with one OWNER membership each.');
  })
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    void admin.$disconnect();
  });

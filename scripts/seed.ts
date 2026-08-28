import { connectDB } from "../src/lib/db";
import { ensurePlatformData } from "../src/services/bootstrapService";

async function main() {
  await connectDB();
  await ensurePlatformData();
  process.stdout.write("MongoDB platform data is ready.\n");
}

main()
  .then(() => process.exit(0))
  .catch(() => {
    process.stderr.write("MongoDB seed failed. Check the connection and environment configuration.\n");
    process.exit(1);
  });

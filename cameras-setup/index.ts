import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { generate } from "./generate"
import { sync } from "./sync"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

sync(root)
generate(root)

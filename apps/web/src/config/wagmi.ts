import { http, createConfig } from "wagmi";
import { injected } from "wagmi/connectors";
import { arbitrumSepolia } from "viem/chains";

import { RPC_URL } from "./chain";

export const wagmiConfig = createConfig({
  chains: [arbitrumSepolia],
  connectors: [injected()],
  transports: {
    [arbitrumSepolia.id]: http(RPC_URL),
  },
});

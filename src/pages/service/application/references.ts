import {
  createPartyReference,
  geographyRegionSource,
  inventoryReference,
  serviceItemReference,
  serviceTargetReference,
} from "@/api/master-data/reference";

export const principalPartyReference = createPartyReference("委托方");
export const providerPartyReference = createPartyReference("服务方");
export { geographyRegionSource, inventoryReference, serviceItemReference, serviceTargetReference };

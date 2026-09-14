/** Internal search types; these are not HTTP or shared wire contracts. */
export interface HotelSearchInput {
  /** Exact destination match, ignoring surrounding whitespace and case. */
  destination: string;
}

export interface HotelSearchResult {
  id: string;
  name: string;
  destination: string;
}

export interface HotelSearchResponse {
  /** V1 returns fictional demo data only. */
  mock: true;
  hotels: HotelSearchResult[];
}

/** Search-only seam for future authorized executors. */
export interface NoktosClient {
  searchHotels(input: HotelSearchInput): Promise<HotelSearchResponse>;
}

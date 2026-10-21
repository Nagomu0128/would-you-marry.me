import { MizuhikiKnot, type MizuhikiKnotProps } from '../ornaments/MizuhikiKnot'

/**
 * @deprecated MizuhikiKnot を直接使う。旧デザインの印（蝶結び）は結婚式に合わないため、あわじ結びに置き換えた
 */
export function WeddingMark(props: MizuhikiKnotProps) {
  return <MizuhikiKnot strands="three" {...props} />
}

import {Quaternion,Vector3} from 'three'

const UP=new Vector3(0,1,0),RAD=Math.PI/180
// Establish north from the first meaningful GPS movement, never across a gap.
// Skip sub-three-metre displacement so a stationary GPS fix does not set heading.
export function initialRouteHeading(segments){
  for(const segment of segments){
    const start=segment[0]
    if(!start)continue
    for(const point of segment.slice(1)){
      const north=(point.lat-start.lat)*RAD
      const east=(point.lon-start.lon)*RAD*Math.cos((point.lat+start.lat)*RAD/2)
      if(Math.hypot(north,east)*6371000>=3)return (Math.atan2(east,north)/RAD+360)%360
    }
  }
  return undefined
}

// The normalized model faces +X. In the north-up instrument, -Z is north,
// +X is east. Apply the GPS reference in world space, preserving IMU tilt.
export function mapAlignedAttitude(relative,heading){
  const reference=new Quaternion().setFromAxisAngle(UP,(90-heading)*RAD)
  return reference.multiply(new Quaternion().fromArray(relative)).toArray()
}

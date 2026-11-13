'use client';
import { CURRENT_VEHICLE_KEY } from './SceneVehicleSelect';
import { parseSceneVehicle, type SceneVehicle } from '@/lib/sceneConfiguration';
const vehicles: {value:SceneVehicle;label:string;image?:string}[] = [
  {value:'sports_car',label:'Ferrari · sports car',image:'/vehicles/ferrari.png'},
  {value:'sedan',label:'BMW M5 · sedan',image:'/vehicles/bmwM5.png'},
  {value:'suv',label:'Escalade · SUV',image:'/vehicles/escalade.png'},
  {value:'none',label:'No vehicle'}, {value:'undecided',label:'Undecided'},
];
export function SceneVehicleThumbnail({value,locked,disabled,onEdit,onChange,index}:{value:SceneVehicle;locked:boolean;disabled:boolean;onEdit:()=>void;onChange:(value:SceneVehicle)=>void;index:number}) {
  const vehicle=vehicles.find(item=>item.value===value)!;
  const preview=vehicle.image ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={vehicle.image} alt={vehicle.label} /> : <span>{vehicle.label}</span>;
  return locked ? <button type="button" className="scene-vehicle-preview" aria-label={`Edit vehicle for scene ${index}: ${vehicle.label}`} disabled={disabled} onClick={onEdit}>{preview}<span aria-hidden="true" className="vehicle-chevron">⌄</span></button>
    : <div className="scene-vehicle-preview is-editing">{preview}<span aria-hidden="true" className="vehicle-chevron">⌄</span><select aria-label={`Vehicle for scene ${index} *`} required value={value} disabled={disabled} onChange={event=>{
      const next=parseSceneVehicle(event.target.value);onChange(next);
      try {localStorage.setItem(CURRENT_VEHICLE_KEY,next);}catch{/* Optional default. */}
    }}>{vehicles.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</select></div>;
}

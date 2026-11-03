package com.paqrap.backend.config;
import org.junit.jupiter.api.Test;
import com.paqrap.simulador.TipoEscenario;
import java.time.LocalDateTime;
import static org.junit.jupiter.api.Assertions.*;
class IdentidadEjecucionTest {
 @Test void cadaInstantaneaIdentificaLaEjecucionQueLaProdujo() {
  var config=new PaqRapConfig();
  var auto=config.tipoAuto();var moto=config.tipoMoto();var bici=config.tipoBici();
  var servicio=config.servicioPlanificacion(config.ciudad(),config.configuracionOperacion(),config.tiposVehiculo(auto,moto,bici),config.almacenes(),config.flota(auto,moto,bici),null);
  var first=servicio.seleccionarEscenario(TipoEscenario.CINCO_DIAS,LocalDateTime.of(2026,11,1,18,0));
  try { assertEquals(first.getIdEjecucion(),servicio.consultarEstadoOperacion().idEjecucion()); }
  finally {servicio.detenerEjecucion(first.getIdEjecucion());}
  var second=servicio.seleccionarEscenario(TipoEscenario.CINCO_DIAS,LocalDateTime.of(2026,1,1,0,0));
  try {
   var state=servicio.consultarEstadoOperacion();
   assertNotEquals(first.getIdEjecucion(),second.getIdEjecucion());
   assertEquals(second.getIdEjecucion(),state.idEjecucion());
   assertEquals(2026,state.marcaTiempoActual().getYear());
   assertEquals(1,state.marcaTiempoActual().getMonthValue());
  } finally {servicio.detenerEjecucion(second.getIdEjecucion());}
 }
}

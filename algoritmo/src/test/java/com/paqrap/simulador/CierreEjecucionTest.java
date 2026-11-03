package com.paqrap.simulador;
import com.paqrap.dominio.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;
class CierreEjecucionTest {
 @Test void cerrarEsperaElLoteEnCurso(@TempDir Path logs) throws Exception {
  var entered=new CountDownLatch(1);var release=new CountDownLatch(1);
  Planificador planner=c->{ entered.countDown();try { if(!release.await(5,TimeUnit.SECONDS)) throw new IllegalStateException("No se libero la prueba"); }catch(InterruptedException e){throw new RuntimeException(e);}return List.of();};
  var context=new ContextoProblema(LocalDateTime.of(2026,1,1,0,0),List.of(),List.of(),List.of(),List.of(),List.of(),new Ciudad(70,50,new Nodo(0,0),1,true),new ConfiguracionOperacion(8,7,1,1,1,0,0.5,2));
  var runner=new OrquestadorOperacion(planner,new GestorLogSimulacion(logs.toString(),false),1f,0.1f,1f,1f,context,null);
  var worker=Executors.newSingleThreadExecutor();
  try {
   runner.iniciarCicloPeriodico(TipoEscenario.CINCO_DIAS);
   assertTrue(entered.await(5,TimeUnit.SECONDS));
   var started=new CountDownLatch(1);
   var closed=worker.submit(()->{started.countDown();runner.detener();});
   assertTrue(started.await(5,TimeUnit.SECONDS));
   assertThrows(TimeoutException.class,()->closed.get(150,TimeUnit.MILLISECONDS));
   release.countDown();closed.get(5,TimeUnit.SECONDS);
   assertEquals(EstadoEjecucion.FINALIZADA,runner.getEjecucionActual().getEstado());
  } finally {release.countDown();runner.detener();worker.shutdownNow();}
 }
}

package com.paqrap.simulador;
import com.paqrap.dominio.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import static org.junit.jupiter.api.Assertions.*;
class HistorialPedidosTest {
 @Test void conservaEntregadosSinMostrarFuturos(@TempDir Path logs) throws Exception {
  var now=LocalDateTime.of(2026,1,1,1,31);
  var delivered=new Pedido("P1","C1",new Nodo(56,30),2,36,now.minusMinutes(1));
  var delivery=new ParadaPlanificada(delivered,2);delivery.setEstado(EstadoParada.CUMPLIDA);
  delivered.getEntregasParciales().add(delivery);
  var future=new Pedido("P2","C2",new Nodo(21,29),6,18,now.plusHours(3));
  var context=new ContextoProblema(now,List.of(delivered,future),List.of(),List.of(),List.of(),List.of(),new Ciudad(70,50,new Nodo(0,0),1,true),new ConfiguracionOperacion(8,7,1,1,1,0,0.5,2));
  var runner=new OrquestadorOperacion(c -> List.of(),new GestorLogSimulacion(logs.toString(),false),1f,0.1f,1f,1f,context,null);
  var finished=new CompletableFuture<Void>();
  runner.setAlCerrarLote(()-> { if(runner.getContextoProblema().pedidos().stream().noneMatch(p->p.getIdPedido().equals("P1"))) finished.complete(null); });
  try {
   runner.iniciarCicloPeriodico(TipoEscenario.CINCO_DIAS);
   finished.get(5,TimeUnit.SECONDS);
   assertEquals(List.of("P1"),runner.getPedidosRecibidos().stream().map(Pedido::getIdPedido).toList());
   assertEquals(EstadoPedido.ENTREGADA,runner.getPedidosRecibidos().get(0).getEstado());
   assertTrue(runner.getContextoProblema().pedidos().stream().noneMatch(p->p.getIdPedido().equals("P1")));
  } finally { runner.detener(); }
 }
}
